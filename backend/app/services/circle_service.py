"""Study circle service."""

import secrets
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from backend.app.core.exceptions import (
    AlreadyExistsError,
    BadRequestError,
    ForbiddenError,
    NotFoundError,
)
from backend.app.models.circle import CircleMember, CircleSessionParticipant, StudyCircle
from backend.app.models.profile import UserProfile
from backend.app.models.quiz import QuizSession
from backend.app.models.user import User
from backend.app.schemas.circle import (
    CircleCreateRequest,
    CircleMemberResponse,
    CircleQuizSessionItem,
    CircleResponse,
    CircleSessionParticipantItem,
    CircleStatsResponse,
    CircleUpdateRequest,
    DomainStat,
    JoinCircleRequest,
    LeaderboardEntry,
)


async def create_circle(
    req: CircleCreateRequest, user: User, session: AsyncSession
) -> CircleResponse:
    circle = StudyCircle(
        name=req.name,
        description=req.description,
        creator_id=user.id,
        invite_code=secrets.token_urlsafe(8)[:12],
        max_members=req.max_members,
        is_public=req.is_public,
    )
    session.add(circle)
    await session.flush()
    await session.refresh(circle)

    # Add creator as owner member
    member = CircleMember(
        circle_id=circle.id,
        user_id=user.id,
        role="owner",
    )
    session.add(member)
    await session.flush()

    return await _circle_to_response(circle, session)


async def list_user_circles(user: User, session: AsyncSession) -> list[CircleResponse]:
    member_count_subq = (
        select(CircleMember.circle_id, func.count(CircleMember.id).label("member_count"))
        .group_by(CircleMember.circle_id)
        .subquery()
    )
    result = await session.execute(
        select(StudyCircle, func.coalesce(member_count_subq.c.member_count, 0))
        .join(CircleMember, CircleMember.circle_id == StudyCircle.id)
        .outerjoin(member_count_subq, member_count_subq.c.circle_id == StudyCircle.id)
        .where(CircleMember.user_id == user.id, StudyCircle.is_active.is_(True))
    )
    return [
        CircleResponse(
            id=c.id, name=c.name, description=c.description,
            avatar_url=c.avatar_url, creator_id=c.creator_id,
            invite_code=c.invite_code, max_members=c.max_members,
            is_active=c.is_active, is_public=c.is_public,
            member_count=count, created_at=str(c.created_at),
        )
        for c, count in result.all()
    ]


async def get_circle(
    circle_id: int, session: AsyncSession
) -> CircleResponse:
    circle = await _get_circle_or_404(circle_id, session)
    return await _circle_to_response(circle, session)


async def update_circle(
    circle_id: int, req: CircleUpdateRequest, user: User, session: AsyncSession
) -> CircleResponse:
    circle = await _get_circle_or_404(circle_id, session)
    await _check_circle_owner(circle_id, user, session)

    if req.name is not None:
        circle.name = req.name
    if req.description is not None:
        circle.description = req.description
    if req.avatar_url is not None:
        circle.avatar_url = req.avatar_url
    if req.max_members is not None:
        circle.max_members = req.max_members
    if req.is_public is not None:
        circle.is_public = req.is_public
    circle.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    session.add(circle)
    await session.flush()
    await session.refresh(circle)
    return await _circle_to_response(circle, session)


async def delete_circle(
    circle_id: int, user: User, session: AsyncSession
) -> None:
    circle = await _get_circle_or_404(circle_id, session)
    await _check_circle_owner(circle_id, user, session)
    circle.is_active = False
    session.add(circle)
    await session.commit()


async def join_circle(
    req: JoinCircleRequest, user: User, session: AsyncSession
) -> CircleResponse:
    result = await session.execute(
        select(StudyCircle).where(
            StudyCircle.invite_code == req.invite_code,
            StudyCircle.is_active.is_(True),
        )
    )
    circle = result.scalar_one_or_none()
    if not circle:
        raise NotFoundError("Circle with this invite code")

    # Check already member
    existing = await session.execute(
        select(CircleMember).where(
            CircleMember.circle_id == circle.id,
            CircleMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise AlreadyExistsError("Membership")

    # Check max members
    count_result = await session.execute(
        select(func.count(CircleMember.id)).where(CircleMember.circle_id == circle.id)
    )
    if count_result.scalar() >= circle.max_members:
        raise BadRequestError("Circle is full")

    member = CircleMember(
        circle_id=circle.id,
        user_id=user.id,
        role="member",
    )
    session.add(member)
    await session.flush()
    return await _circle_to_response(circle, session)


async def list_members(
    circle_id: int, session: AsyncSession
) -> list[CircleMemberResponse]:
    result = await session.execute(
        select(CircleMember, User)
        .join(User, User.id == CircleMember.user_id)
        .where(CircleMember.circle_id == circle_id)
    )
    members = []
    for cm, usr in result.all():
        members.append(CircleMemberResponse(
            id=cm.id,
            user_id=usr.id,
            username=usr.username,
            full_name=usr.full_name,
            avatar_url=usr.avatar_url,
            role=cm.role,
            joined_at=str(cm.joined_at),
        ))
    return members


async def remove_member(
    circle_id: int, user_id: int, current_user: User, session: AsyncSession
) -> None:
    await _check_circle_owner(circle_id, current_user, session)

    result = await session.execute(
        select(CircleMember).where(
            CircleMember.circle_id == circle_id,
            CircleMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise NotFoundError("Member")
    if member.role == "owner":
        raise BadRequestError("Cannot remove the circle owner")
    await session.delete(member)


async def get_circle_stats(
    circle_id: int, session: AsyncSession
) -> CircleStatsResponse:
    await _get_circle_or_404(circle_id, session)

    # Fetch all members + their user info
    member_result = await session.execute(
        select(CircleMember, User)
        .join(User, User.id == CircleMember.user_id)
        .where(CircleMember.circle_id == circle_id)
    )
    member_rows = member_result.all()
    member_count = len(member_rows)

    # Fetch UserProfile for each member
    user_ids = [usr.id for _, usr in member_rows]
    profile_result = await session.execute(
        select(UserProfile).where(UserProfile.user_id.in_(user_ids))
    )
    profiles_by_user: dict[int, UserProfile] = {
        p.user_id: p for p in profile_result.scalars().all()
    }

    # Aggregate domain stats
    domain_accuracy: dict[str, list[float]] = {}
    leaderboard: list[LeaderboardEntry] = []

    for cm, usr in member_rows:
        profile = profiles_by_user.get(usr.id)
        profile_data: dict = profile.profile_data if profile and profile.profile_data else {}

        domain_profiles: dict = profile_data.get("domain_profiles", {})
        for domain, dp in domain_profiles.items():
            acc = dp.get("accuracy", 0.0) if isinstance(dp, dict) else 0.0
            domain_accuracy.setdefault(domain, []).append(acc)

        leaderboard.append(LeaderboardEntry(
            user_id=usr.id,
            username=usr.username,
            full_name=usr.full_name,
            avatar_url=usr.avatar_url,
            role=cm.role,
            total_questions=profile_data.get("total_questions_answered", 0),
            overall_accuracy=profile_data.get("overall_accuracy", 0.0),
        ))

    # Sort leaderboard by total_questions desc
    leaderboard.sort(key=lambda e: e.total_questions, reverse=True)

    # Build domain_stats
    domain_stats = [
        DomainStat(
            domain=domain,
            avg_accuracy=round(sum(accs) / len(accs), 4) if accs else 0.0,
            member_count=len(accs),
        )
        for domain, accs in domain_accuracy.items()
    ]
    domain_stats.sort(key=lambda d: d.avg_accuracy, reverse=True)

    return CircleStatsResponse(
        circle_id=circle_id,
        member_count=member_count,
        domain_stats=domain_stats,
        leaderboard=leaderboard,
    )


async def get_circle_quiz_sessions(
    circle_id: int,
    session: AsyncSession,
    limit: int = 20,
    user: User | None = None,
) -> list[CircleQuizSessionItem]:
    await _get_circle_or_404(circle_id, session)

    # Bug fix: include "graded" status so completed sessions appear in the list
    result = await session.execute(
        select(QuizSession, User)
        .join(User, User.id == QuizSession.creator_id)
        .where(
            QuizSession.circle_id == circle_id,
            QuizSession.status.in_(["ready", "in_progress", "grading", "graded"]),
        )
        .order_by(QuizSession.created_at.desc())
        .limit(limit)
    )
    rows = result.all()

    if not rows:
        return []

    # Fetch participant counts per session
    session_ids = [qs.id for qs, _ in rows]
    count_result = await session.execute(
        select(
            CircleSessionParticipant.session_id,
            func.count(CircleSessionParticipant.id).label("cnt"),
        )
        .where(CircleSessionParticipant.session_id.in_(session_ids))
        .group_by(CircleSessionParticipant.session_id)
    )
    participant_counts: dict[str, int] = {row.session_id: row.cnt for row in count_result.all()}

    # Fetch current user's participant status if user provided
    user_statuses: dict[str, str] = {}
    if user:
        us_result = await session.execute(
            select(CircleSessionParticipant).where(
                CircleSessionParticipant.session_id.in_(session_ids),
                CircleSessionParticipant.user_id == user.id,
            )
        )
        user_statuses = {p.session_id: p.status for p in us_result.scalars().all()}

    items = []
    for qs, usr in rows:
        items.append(CircleQuizSessionItem(
            id=qs.id,
            creator_id=qs.creator_id,
            creator_username=usr.username,
            creator_full_name=usr.full_name,
            title=qs.title,
            mode=qs.mode,
            status=qs.status,
            total_score=qs.total_score,
            accuracy=qs.accuracy,
            created_at=str(qs.created_at),
            participant_count=participant_counts.get(qs.id, 0),
            current_user_status=user_statuses.get(qs.id),
        ))
    return items


async def get_session_participants(
    circle_id: int, session_id: str, db: AsyncSession
) -> list[CircleSessionParticipantItem]:
    """Get ranked participants for a circle quiz session."""
    # Verify the session belongs to this circle
    session_result = await db.execute(
        select(QuizSession).where(
            QuizSession.id == session_id,
            QuizSession.circle_id == circle_id,
        )
    )
    if not session_result.scalar_one_or_none():
        raise NotFoundError("Quiz session")

    result = await db.execute(
        select(CircleSessionParticipant, User)
        .join(User, User.id == CircleSessionParticipant.user_id)
        .where(CircleSessionParticipant.session_id == session_id)
        .order_by(
            CircleSessionParticipant.total_score.desc().nullslast(),
            CircleSessionParticipant.completed_at.asc().nullslast(),
        )
    )

    return [
        CircleSessionParticipantItem(
            user_id=usr.id,
            username=usr.username,
            full_name=usr.full_name,
            status=p.status,
            accuracy=p.accuracy,
            total_score=p.total_score,
            completed_at=p.completed_at,
        )
        for p, usr in result.all()
    ]


async def _get_circle_or_404(circle_id: int, session: AsyncSession) -> StudyCircle:
    result = await session.execute(
        select(StudyCircle).where(StudyCircle.id == circle_id)
    )
    circle = result.scalar_one_or_none()
    if not circle or not circle.is_active:
        raise NotFoundError("Study circle")
    return circle


async def _check_circle_owner(
    circle_id: int, user: User, session: AsyncSession
) -> None:
    result = await session.execute(
        select(CircleMember).where(
            CircleMember.circle_id == circle_id,
            CircleMember.user_id == user.id,
            CircleMember.role == "owner",
        )
    )
    if not result.scalar_one_or_none() and not user.is_admin:
        raise ForbiddenError("Not the circle owner")


async def _circle_to_response(
    circle: StudyCircle, session: AsyncSession
) -> CircleResponse:
    count_result = await session.execute(
        select(func.count(CircleMember.id)).where(CircleMember.circle_id == circle.id)
    )
    return CircleResponse(
        id=circle.id,
        name=circle.name,
        description=circle.description,
        avatar_url=circle.avatar_url,
        creator_id=circle.creator_id,
        invite_code=circle.invite_code,
        max_members=circle.max_members,
        is_active=circle.is_active,
        is_public=circle.is_public,
        member_count=count_result.scalar() or 0,
        created_at=str(circle.created_at),
    )
