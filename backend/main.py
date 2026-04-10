"""
main.py
-------
FraudGraph AI — FastAPI application entry point.
Registers middleware, routers, and startup events.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes.fraud import router

app = FastAPI(
    title="FraudGraph AI",
    description="Agentic fraud investigation system — Neuro-Symbolic AI + GNN + MAPF",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/", tags=["root"])
def root():
    return {"service": "FraudGraph AI", "status": "running", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
