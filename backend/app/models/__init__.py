"""Models package — import all models so Alembic can discover them."""

from backend.app.models.exam_template import (  # noqa: F401
    ExamTemplate,
    ExamTemplateSlot,
    ExamTemplateSlotQuestion,
)
from backend.app.models.circle import CircleMember, StudyCircle  # noqa: F401
from backend.app.models.circle_profile import CircleProfile  # noqa: F401
from backend.app.models.knowledge_base import (  # noqa: F401
    KBAcquisition,
    KBChunk,
    KBDocument,
    KBFolder,
    KnowledgeBase,
)
from backend.app.models.notification import Notification  # noqa: F401
from backend.app.models.profile import ProfileShare, UserProfile  # noqa: F401
from backend.app.models.quiz import (  # noqa: F401
    QuizQuestion,
    QuizResponse,
    QuizSession,
)
from backend.app.models.quiz_preset import QuizPreset  # noqa: F401
from backend.app.models.system_config import SystemConfig  # noqa: F401
from backend.app.models.user import User  # noqa: F401
