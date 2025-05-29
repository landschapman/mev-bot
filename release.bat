@echo off
setlocal

REM Prompt for version
set /p VERSION=Enter new version (e.g. 1.3.1): 

REM Update package.json version
powershell -Command "(Get-Content package.json) -replace '"version": ".*?"', '"version": "%VERSION%"' | Set-Content package.json"

REM Add all changes
git add .

REM Commit
git commit -m "chore(release): v%VERSION%"

REM Tag
git tag -a v%VERSION% -m "v%VERSION%"

REM Push commit and tag
git push
git push origin v%VERSION%

echo Release v%VERSION% complete.
endlocal 