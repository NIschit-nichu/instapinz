@echo off
echo ========================================
echo    Instagram Post Scraper
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Check if requirements are installed
echo Checking dependencies...
pip show instaloader >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo Starting Instagram scraper...
echo.

REM Run the scraper
python scrape_instagram.py

echo.
echo Press any key to exit...
pause >nul 