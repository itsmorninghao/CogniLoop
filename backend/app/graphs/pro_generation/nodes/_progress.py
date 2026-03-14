"""Loop-aware progress calculation for Pro generation graph."""


def compute_loop_progress(
    completed_count: int,
    total_questions: int,
    step_fraction: float,
) -> float:
    """Return a progress float in [0.12, 0.92] for loop nodes.

    Args:
        completed_count: number of questions already finished.
        total_questions: total questions to generate.
        step_fraction: sub-step within the current question.
            0.0 = start
            0.2 = question_generator
            0.4 = quality_checker
            0.6 = solve_verifier
            0.8 = difficulty_analyzer
    """
    per_q = 0.80 / max(total_questions, 1)
    return round(0.12 + (completed_count + step_fraction) * per_q, 3)


def compute_batch_progress(
    completed_count: int,
    total_questions: int,
    batch_size: int,
    step_fraction: float,
) -> float:
    """Return progress for a batch pipeline step.

    During batch execution, the progress represents the furthest along
    sub-step in the current batch (uses the batch start index for the
    completed_count so progress never goes backward).

    Args:
        completed_count: number of questions already finished before this batch.
        total_questions: total questions to generate.
        batch_size: number of questions in the current batch.
        step_fraction: sub-step fraction (0.0 to 0.8) for the step being executed.
    """
    per_q = 0.80 / max(total_questions, 1)
    # Use the end of the batch for progress to avoid regression
    batch_end = completed_count + batch_size
    return round(
        0.12 + (min(batch_end, total_questions) - 1 + step_fraction) * per_q, 3
    )
