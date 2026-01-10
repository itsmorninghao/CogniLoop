"""文档解析器：支持 PDF、Word、Markdown、PPT"""

from pathlib import Path

import aiofiles
from docx import Document as DocxDocument
from pptx import Presentation
from pypdf import PdfReader

from backend.app.models.document import FileType


class DocumentParser:
    async def parse(self, file_path: str, file_type: FileType) -> str:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")

        parsers = {
            FileType.PDF: self._parse_pdf,
            FileType.WORD: self._parse_word,
            FileType.MARKDOWN: self._parse_markdown,
            FileType.PPT: self._parse_ppt,
        }
        parser = parsers.get(file_type)
        if not parser:
            raise ValueError(f"不支持的文件类型: {file_type}")
        return await parser(path)

    async def _parse_pdf(self, path: Path) -> str:
        reader = PdfReader(str(path))
        text_parts = [page.extract_text() for page in reader.pages if page.extract_text()]
        return "\n\n".join(text_parts)

    async def _parse_word(self, path: Path) -> str:
        doc = DocxDocument(str(path))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

    async def _parse_markdown(self, path: Path) -> str:
        async with aiofiles.open(path, encoding="utf-8") as f:
            return await f.read()

    async def _parse_ppt(self, path: Path) -> str:
        prs = Presentation(str(path))
        text_parts = []
        for slide in prs.slides:
            slide_text = [shape.text for shape in slide.shapes if hasattr(shape, "text") and shape.text.strip()]
            if slide_text:
                text_parts.append("\n".join(slide_text))
        return "\n\n".join(text_parts)
