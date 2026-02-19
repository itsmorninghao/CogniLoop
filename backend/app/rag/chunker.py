"""文本分块器"""

from backend.app.services.config_service import get_config_int


class TextChunker:
    def __init__(
        self,
        chunk_size: int | None = None,
        overlap: int | None = None,
    ) -> None:
        self.chunk_size = chunk_size or get_config_int("chunk_size")
        self.overlap = overlap or get_config_int("chunk_overlap")
        if self.chunk_size < 1:
            self.chunk_size = 500
        if self.overlap >= self.chunk_size:
            self.overlap = self.chunk_size // 5

    def chunk(self, text: str) -> list[str]:
        if not text or not text.strip():
            return []

        text = text.strip()
        if len(text) <= self.chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < len(text):
            end = start + self.chunk_size
            if end < len(text):
                split_pos = self._find_split_position(text, start, end)
                if split_pos > start:
                    end = split_pos

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            start = end - self.overlap if end < len(text) else end

        return chunks

    def _find_split_position(self, text: str, start: int, end: int) -> int:
        """在句号/换行处寻找最佳分割点"""
        split_chars = ["。", ".", "\n", "！", "？", "!", "?", "；", ";"]
        for char in split_chars:
            pos = text.rfind(char, start, end)
            if pos > start and pos > start + self.chunk_size // 2:
                return pos + 1
        return end
