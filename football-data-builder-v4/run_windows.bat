@echo off
python -m venv .venv
call .venv\Scripts\activate
python -m pip install -r requirements.txt
python cli.py init
python cli.py seed-demo --fresh
python cli.py apply-overrides
streamlit run app.py
