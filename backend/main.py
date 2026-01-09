import base64
from datetime import datetime
import os
import subprocess
import fastapi
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import tempfile
import strawberry
from strawberry.fastapi import GraphQLRouter
from pdflatex import PDFLaTeX

from data_model import ResumeData

# subprocess.run(["pdflatex", "--version"])

app = fastapi.FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/test")
def read_root():
    return {"Hello": "World"}


cached_resume: ResumeData = None


@app.get("/resume")
def get_resume():
    global cached_resume
    if cached_resume is None:
        raise fastapi.HTTPException(
            status_code=404, detail="Resume not cached yet")
    return cached_resume


@app.post("/resume")
def set_resume(resume: ResumeData):
    global cached_resume
    cached_resume = resume
    return {"success": True}


def compile_latex(latex_content: str) -> bytes:
    """Compile the LaTeX content to PDF"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tex_file = "resume.tex"
        pdf_file = "resume.pdf"
        tex_path = os.path.join(tmp_dir, tex_file)
        pdf_path = os.path.join(tmp_dir, pdf_file)

        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex_content)

        print(f"Compiling LaTeX file: {tex_path}")
        # Pass only the filename, cwd avoids spaces
        process = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", tex_file],
            cwd=tmp_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if not os.path.exists(pdf_path):
            log = process.stdout.decode(
                "utf-8") + "\n" + process.stderr.decode("utf-8")
            raise Exception(f"LaTeX compilation failed:\n{log}")

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

        return pdf_bytes

    # tmp_tex_path = None
    # try:
    #     with tempfile.NamedTemporaryFile(suffix=".tex", delete=False, mode="w", encoding="utf-8") as tmp_file:
    #         tmp_tex_path = tmp_file.name
    #         tmp_file.write(latex_content)

    #     print(f"Compiling LaTeX file: {tmp_tex_path}")
    #     pdfl = PDFLaTeX.from_texfile(tmp_tex_path)
    #     pdf, log, completed_process = pdfl.create_pdf(keep_pdf_file=False, keep_log_file=True)
    #     print("PDFLaTeX log output:")
    #     print(log.decode("utf-8"))
    #     return pdf
    # except Exception as e:
    #     print("LaTeX compilation failed:")
    #     print(e)
    #     raise Exception("PDF compilation failed: " + str(e))
    # finally:
    #     if tmp_tex_path is not None and os.path.exists(tmp_tex_path):
    #         os.unlink(tmp_tex_path)


@app.post("/pdf-download")
def get_pdf_download(resume: ResumeData):
    try:
        pdf = compile_latex(resume.resume)
        return fastapi.responses.Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=resume.pdf"},
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise fastapi.HTTPException(status_code=500, detail=str(e))


@app.post("/pdf-display")
def get_pdf_display(resume: ResumeData):
    try:
        pdf = compile_latex(resume.resume)
        pdf_base64 = base64.b64encode(pdf).decode("utf-8")
        return {"pdf": pdf_base64}
    except Exception as e:
        import traceback

        print("===== ERROR IN /pdf-display =====")
        traceback.print_exc()
        raise fastapi.HTTPException(status_code=500, detail=str(e))


schema = strawberry.Schema(query=Query)
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")
