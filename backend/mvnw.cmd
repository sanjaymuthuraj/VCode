@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "MAVEN_CMD=%SCRIPT_DIR%..\maven\apache-maven-3.9.6\bin\mvn.cmd"

if not exist "%MAVEN_CMD%" (
  echo Bundled Maven was not found at "%MAVEN_CMD%". >&2
  exit /b 1
)

call "%MAVEN_CMD%" %*
exit /b %ERRORLEVEL%
