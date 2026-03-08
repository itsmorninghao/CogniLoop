"""Profile service — incremental & full profile calculation."""

from datetime import datetime, timezone

from sqlalchemy import select, union
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.circle import CircleSessionParticipant
from backend.app.models.profile import ProfileShare, UserProfile
from backend.app.models.quiz import QuizQuestion, QuizResponse, QuizSession


async def get_or_create_profile(user_id: int, session: AsyncSession) -> UserProfile:
    """Get existing profile or create a new one with empty data."""
    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    profile = UserProfile(
        user_id=user_id,
        profile_data=_empty_profile(user_id),
        profile_version=0,
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def incremental_update(
    user_id: int, session_id: str, db: AsyncSession
) -> UserProfile:
    """
    After grading completes, update the profile incrementally
    with data from the just-completed quiz session.
    """
    profile = await get_or_create_profile(user_id, db)
    data: dict = (
        dict(profile.profile_data) if profile.profile_data else _empty_profile(user_id)
    )

    sess_result = await db.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    quiz_session = sess_result.scalar_one_or_none()
    if not quiz_session:
        return profile

    q_result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.session_id == session_id)
    )
    questions = q_result.scalars().all()

    r_result = await db.execute(
        select(QuizResponse).where(
            QuizResponse.session_id == session_id,
            QuizResponse.user_id == user_id,
        )
    )
    responses = r_result.scalars().all()
    resp_map = {r.question_id: r for r in responses}

    quiz_config = quiz_session.quiz_config or {}
    subject = str(quiz_config.get("subject", "") or "").strip() or "综合"
    difficulty = str(quiz_config.get("difficulty", "medium") or "medium")

    total_answered = data.get("total_questions_answered", 0)
    total_correct = int(total_answered * data.get("overall_accuracy", 0))

    session_correct = 0
    session_total = 0
    session_time_total = 0
    session_time_count = 0

    qt_profiles: dict = data.get("question_type_profiles", {})
    kp_profiles: dict = data.get("knowledge_point_profiles", {})

    for q in questions:
        resp = resp_map.get(q.id)
        if not resp:
            continue

        session_total += 1
        # Weighted correctness: use score/max_score for partial credit (e.g. multi-choice)
        max_s = q.score if q.score and q.score > 0 else 1.0
        resp_score = resp.score if resp.score is not None else (max_s if resp.is_correct else 0)
        weight = resp_score / max_s
        session_correct += weight

        if resp.time_spent is not None and resp.time_spent > 0:
            session_time_total += resp.time_spent
            session_time_count += 1

        qt = q.question_type
        if qt not in qt_profiles:
            qt_profiles[qt] = {"accuracy": 0.0, "count": 0, "correct": 0}

        qt_entry = qt_profiles[qt]
        qt_entry["count"] = qt_entry.get("count", 0) + 1
        qt_entry["correct"] = qt_entry.get("correct", 0) + weight
        qt_entry["accuracy"] = (
            qt_entry["correct"] / qt_entry["count"] if qt_entry["count"] > 0 else 0
        )

        for point in (q.knowledge_points or []):
            if point not in kp_profiles:
                kp_profiles[point] = {"attempts": 0, "correct": 0, "accuracy": 0.0}
            kp_profiles[point]["attempts"] += 1
            kp_profiles[point]["correct"] += weight
            kp_profiles[point]["accuracy"] = (
                kp_profiles[point]["correct"] / kp_profiles[point]["attempts"]
            )

    new_total = total_answered + session_total
    new_correct = total_correct + session_correct
    data["total_questions_answered"] = new_total
    data["overall_accuracy"] = new_correct / new_total if new_total > 0 else 0
    data["question_type_profiles"] = qt_profiles
    data["knowledge_point_profiles"] = kp_profiles

    domain_profiles: dict = data.get("domain_profiles", {})
    if subject not in domain_profiles:
        domain_profiles[subject] = {
            "accuracy": 0.0,
            "question_count": 0,
            "correct": 0,
            "avg_time_per_question": 0.0,
            "difficulty_stats": {},  # difficulty -> {correct, total}
        }

    dp = domain_profiles[subject]
    dp["correct"] = dp.get("correct", 0) + session_correct
    dp["question_count"] = dp.get("question_count", 0) + session_total
    dp["accuracy"] = (
        dp["correct"] / dp["question_count"] if dp["question_count"] > 0 else 0
    )

    # Update avg_time_per_question (running mean)
    if session_time_count > 0:
        session_avg = session_time_total / session_time_count
        prev_count = dp["question_count"] - session_total
        if prev_count > 0 and dp.get("avg_time_per_question", 0) > 0:
            dp["avg_time_per_question"] = (
                dp["avg_time_per_question"] * prev_count + session_time_total
            ) / dp["question_count"]
        else:
            dp["avg_time_per_question"] = session_avg

    # Update difficulty stats for preferred_difficulty calculation
    diff_stats: dict = dp.get("difficulty_stats", {})
    if difficulty not in diff_stats:
        diff_stats[difficulty] = {"correct": 0, "total": 0}
    diff_stats[difficulty]["correct"] += session_correct
    diff_stats[difficulty]["total"] += session_total
    dp["difficulty_stats"] = diff_stats
    dp["preferred_difficulty"] = _compute_preferred_difficulty(diff_stats)

    data["domain_profiles"] = domain_profiles

    # Update learning trajectory (keep last 30)
    trajectory: list = data.get("learning_trajectory", [])
    trajectory.append(
        {
            "date": datetime.now(timezone.utc)
            .replace(tzinfo=None)
            .strftime("%Y-%m-%d"),
            "accuracy": session_correct / session_total if session_total > 0 else 0,
            "question_count": session_total,
            "session_id": session_id,
        }
    )
    data["learning_trajectory"] = trajectory[-30:]

    acc = data["overall_accuracy"]
    if new_total < 10:
        data["overall_level"] = "beginner"
    elif acc >= 0.85:
        data["overall_level"] = "advanced"
    elif acc >= 0.65:
        data["overall_level"] = "intermediate"
    else:
        data["overall_level"] = "beginner"

    profile.profile_data = data
    profile.profile_version = (profile.profile_version or 0) + 1
    profile.last_calculated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    profile.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def full_recalculate(user_id: int, db: AsyncSession) -> UserProfile:
    """
    Full profile recalculation from all historical quiz data.
    Usually run as a batch job.
    """
    profile = await get_or_create_profile(user_id, db)

    # Personal sessions (solver_id == user_id)
    personal_ids = (
        select(QuizSession.id)
        .where(QuizSession.solver_id == user_id, QuizSession.status == "graded")
    )
    # Circle sessions the user participated in
    circle_ids = (
        select(QuizSession.id)
        .join(
            CircleSessionParticipant,
            CircleSessionParticipant.session_id == QuizSession.id,
        )
        .where(
            CircleSessionParticipant.user_id == user_id,
            CircleSessionParticipant.status == "completed",
            QuizSession.circle_id.isnot(None),
        )
    )
    combined_ids = union(personal_ids, circle_ids).subquery()

    sess_result = await db.execute(
        select(QuizSession)
        .join(combined_ids, QuizSession.id == combined_ids.c.id)
        .order_by(QuizSession.created_at)
    )
    sessions = sess_result.scalars().all()

    if not sessions:
        return profile

    session_ids = [s.id for s in sessions]
    session_map = {s.id: s for s in sessions}

    q_result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.session_id.in_(session_ids))
    )
    all_questions = q_result.scalars().all()

    r_result = await db.execute(
        select(QuizResponse).where(
            QuizResponse.session_id.in_(session_ids),
            QuizResponse.user_id == user_id,
        )
    )
    all_responses = r_result.scalars().all()
    resp_map = {r.question_id: r for r in all_responses}

    total_answered = 0
    total_correct = 0
    qt_profiles: dict[str, dict] = {}
    kp_profiles_raw: dict[str, dict] = {}
    trajectory: list[dict] = []

    # domain tracking: subject -> {correct, total, time_total, time_count, difficulty_stats}
    domain_acc: dict[str, dict] = {}

    # Group by session for trajectory
    session_stats: dict[str, dict] = {}
    for q in all_questions:
        resp = resp_map.get(q.id)
        if not resp:
            continue

        total_answered += 1
        # Weighted correctness: score/max_score for partial credit
        max_s = q.score if q.score and q.score > 0 else 1.0
        resp_score = resp.score if resp.score is not None else (max_s if resp.is_correct else 0)
        weight = resp_score / max_s
        total_correct += weight

        qt = q.question_type
        if qt not in qt_profiles:
            qt_profiles[qt] = {"accuracy": 0.0, "count": 0, "correct": 0}
        qt_profiles[qt]["count"] += 1
        qt_profiles[qt]["correct"] += weight

        for point in (q.knowledge_points or []):
            if point not in kp_profiles_raw:
                kp_profiles_raw[point] = {"attempts": 0, "correct": 0}
            kp_profiles_raw[point]["attempts"] += 1
            kp_profiles_raw[point]["correct"] += weight

        sess = session_map.get(
            str(q.session_id) if not isinstance(q.session_id, str) else q.session_id
        )
        if sess:
            quiz_config = sess.quiz_config or {}
            subject = str(quiz_config.get("subject", "") or "").strip() or "综合"
            difficulty = str(quiz_config.get("difficulty", "medium") or "medium")
        else:
            subject = "综合"
            difficulty = "medium"

        if subject not in domain_acc:
            domain_acc[subject] = {
                "correct": 0,
                "total": 0,
                "time_total": 0,
                "time_count": 0,
                "difficulty_stats": {},
            }
        domain_acc[subject]["total"] += 1
        domain_acc[subject]["correct"] += weight
        if resp.time_spent is not None and resp.time_spent > 0:
            domain_acc[subject]["time_total"] += resp.time_spent
            domain_acc[subject]["time_count"] += 1

        diff_stats = domain_acc[subject]["difficulty_stats"]
        if difficulty not in diff_stats:
            diff_stats[difficulty] = {"correct": 0, "total": 0}
        diff_stats[difficulty]["total"] += 1
        diff_stats[difficulty]["correct"] += weight

        sid = str(q.session_id)
        if sid not in session_stats:
            session_stats[sid] = {"correct": 0, "total": 0}
        session_stats[sid]["total"] += 1
        session_stats[sid]["correct"] += weight

    for qt_data in qt_profiles.values():
        qt_data["accuracy"] = (
            qt_data["correct"] / qt_data["count"] if qt_data["count"] > 0 else 0
        )

    domain_profiles: dict = {}
    for subject, da in domain_acc.items():
        avg_time = da["time_total"] / da["time_count"] if da["time_count"] > 0 else 0.0
        domain_profiles[subject] = {
            "accuracy": da["correct"] / da["total"] if da["total"] > 0 else 0.0,
            "question_count": da["total"],
            "correct": da["correct"],
            "avg_time_per_question": round(avg_time, 1),
            "difficulty_stats": da["difficulty_stats"],
            "preferred_difficulty": _compute_preferred_difficulty(
                da["difficulty_stats"]
            ),
        }

    for s in sessions:
        stats = session_stats.get(str(s.id))
        if stats and stats["total"] > 0:
            trajectory.append(
                {
                    "date": s.created_at.strftime("%Y-%m-%d") if s.created_at else "",
                    "accuracy": stats["correct"] / stats["total"],
                    "question_count": stats["total"],
                    "session_id": str(s.id),
                }
            )

    acc = total_correct / total_answered if total_answered > 0 else 0

    if total_answered < 10:
        level = "beginner"
    elif acc >= 0.85:
        level = "advanced"
    elif acc >= 0.65:
        level = "intermediate"
    else:
        level = "beginner"

    kp_profiles: dict = {}
    for point, stats in kp_profiles_raw.items():
        kp_profiles[point] = {
            "attempts": stats["attempts"],
            "correct": stats["correct"],
            "accuracy": stats["correct"] / stats["attempts"] if stats["attempts"] > 0 else 0.0,
        }

    # Preserve LLM-generated fields from existing profile
    old_data = dict(profile.profile_data) if profile.profile_data else {}
    data = {
        "user_id": user_id,
        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "overall_level": level,
        "total_questions_answered": total_answered,
        "overall_accuracy": acc,
        "question_type_profiles": qt_profiles,
        "domain_profiles": domain_profiles,
        "learning_trajectory": trajectory[-30:],
        "knowledge_point_profiles": kp_profiles,
        # Preserve LLM-generated fields; profile_rewriter will update them
        "weakness_analysis": old_data.get("weakness_analysis", {}),
        "insight_summary": old_data.get("insight_summary", ""),
        "last_analysis_session_id": old_data.get("last_analysis_session_id"),
    }

    profile.profile_data = data
    profile.profile_version = (profile.profile_version or 0) + 1
    profile.last_calculated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    profile.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def get_profile_share(user_id: int, db: AsyncSession) -> ProfileShare | None:
    """Get active profile share for a user."""
    result = await db.execute(
        select(ProfileShare).where(
            ProfileShare.user_id == user_id,
            ProfileShare.share_type.in_(["public", "link"]),
        )
    )
    return result.scalar_one_or_none()


async def create_profile_share(
    user_id: int, share_type: str, db: AsyncSession
) -> ProfileShare:
    """Create or update profile share."""
    import secrets

    existing = await get_profile_share(user_id, db)
    if existing:
        existing.share_type = share_type
        if share_type == "link":
            existing.share_token = secrets.token_urlsafe(16)
        db.add(existing)
        await db.commit()
        await db.refresh(existing)
        return existing

    share = ProfileShare(
        user_id=user_id,
        share_type=share_type,
        share_token=secrets.token_urlsafe(16) if share_type == "link" else None,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    return share


async def revoke_profile_share(user_id: int, db: AsyncSession) -> None:
    """Delete all profile shares for a user."""
    result = await db.execute(
        select(ProfileShare).where(ProfileShare.user_id == user_id)
    )
    shares = result.scalars().all()
    for share in shares:
        await db.delete(share)
    await db.commit()


def _compute_preferred_difficulty(diff_stats: dict) -> str:
    """Return the difficulty with the highest accuracy. Defaults to 'medium'."""
    best_diff = "medium"
    best_acc = -1.0
    for diff, stats in diff_stats.items():
        if stats.get("total", 0) > 0:
            acc = stats["correct"] / stats["total"]
            if acc > best_acc:
                best_acc = acc
                best_diff = diff
    return best_diff


def _empty_profile(user_id: int) -> dict:
    """Return an empty profile data structure."""
    return {
        "user_id": user_id,
        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "overall_level": "beginner",
        "total_questions_answered": 0,
        "overall_accuracy": 0.0,
        "question_type_profiles": {},
        "domain_profiles": {},
        "learning_trajectory": [],
        "knowledge_point_profiles": {},
        "weakness_analysis": {},
        "insight_summary": "",
        "last_analysis_session_id": None,
    }
