from pydantic import BaseModel

class ResumeData(BaseModel):
    resume: str
    datetime: int
