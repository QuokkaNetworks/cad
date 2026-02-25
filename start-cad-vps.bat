@echo off
setlocal ENABLEDELAYEDEXPANSION

REM --- Self-relocate to temp copy ---
REM cmd.exe reads .bat files from disk line-by-line. If git updates this file mid-run
REM the interpreter loses its place and the window closes. Copy to temp and re-launch.
if not defined CAD_RUNNING_FROM_TEMP (
  set "CAD_TEMP_BAT=%TEMP%\cad-launcher-%RANDOM%.bat"
  copy /Y "%~f0" "!CAD_TEMP_BAT!" >nul 2>nul
  set "CAD_RUNNING_FROM_TEMP=1"
  set "CAD_ORIGINAL_DIR=%~dp0"
  cmd /c ""!CAD_TEMP_BAT!""
  del "!CAD_TEMP_BAT!" >nul 2>nul
  exit /b !ERRORLEVEL!
)

REM --- Bootstrap config ---
REM Set this to your repo URL if running this BAT outside an existing CAD repo checkout.
set "CAD_REPO_URL=https://github.com/QuokkaNetwork/cad.git"
set "CAD_REPO_BRANCH=main"
set "CAD_SUBDIR=cad"

if defined CAD_ORIGINAL_DIR (
  set "SCRIPT_DIR=%CAD_ORIGINAL_DIR%"
) else (
  set "SCRIPT_DIR=%~dp0"
)
for %%I in ("%SCRIPT_DIR%.") do set "SCRIPT_DIR=%%~fI"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "APP_DIR=%SCRIPT_DIR%"
set "NPM_BIN="
set "NPM_INSTALL_FLAGS=--include=dev"
set "POWERSHELL_BIN=powershell"
set "RESOURCE_PACK_DIR=[quokkacad]"
set "RESOURCE_PACK_SCRIPT=deploy\scripts\package-quokkacad.ps1"
set "RESOURCE_PACK_CAD_MANIFEST=%RESOURCE_PACK_DIR%\cad_bridge\fxmanifest.lua"
set "RESOURCE_PACK_VICROADS_MANIFEST=%RESOURCE_PACK_DIR%\npwd_vicroads\fxmanifest.lua"
set "RESOURCE_PACK_FINES_MANIFEST=%RESOURCE_PACK_DIR%\npwd_fines_victoria\fxmanifest.lua"
set "RESOURCE_PACK_CAD_VICROADS_REMOTE=%RESOURCE_PACK_DIR%\cad_bridge\web\dist\remoteEntry.js"
set "RESOURCE_PACK_CAD_FINES_REMOTE=%RESOURCE_PACK_DIR%\cad_bridge\web\finesvic-dist\remoteEntry.js"
set "RESOURCE_PACK_VICROADS_REMOTE=%RESOURCE_PACK_DIR%\npwd_vicroads\web\dist\remoteEntry.js"
set "RESOURCE_PACK_FINES_REMOTE=%RESOURCE_PACK_DIR%\npwd_fines_victoria\web\dist\remoteEntry.js"
set "npm_config_production=false"
set "npm_config_include=dev"

echo [CAD] Starting self-install launcher...

REM --- Detect app directory ---
REM Check if this BAT lives inside an existing CAD repo checkout
if exist "%APP_DIR%\package.json" if exist "%APP_DIR%\server" if exist "%APP_DIR%\web" goto :deps_check
REM Not inside a repo checkout — use a subdirectory
set "APP_DIR=%SCRIPT_DIR%\%CAD_SUBDIR%"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

set "APP_DIR=%APP_DIR:"=%"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

:deps_check
where winget >nul 2>nul
if errorlevel 1 (
  echo [CAD] ERROR: winget not found. Install App Installer from Microsoft Store.
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo [CAD] Git not found. Installing Git...
  winget install --id Git.Git -e --source winget --silent --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo [CAD] ERROR: Git install failed.
    pause
    exit /b 1
  )
  if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
  if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" set "PATH=%ProgramFiles(x86)%\Git\cmd;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo [CAD] Node.js not found. Installing Node LTS...
  winget install --id OpenJS.NodeJS.LTS -e --source winget --silent --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo [CAD] ERROR: Node.js install failed.
    pause
    exit /b 1
  )
  if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

where npm >nul 2>nul
if not errorlevel 1 set "NPM_BIN=npm"
if not defined NPM_BIN (
  where npm.cmd >nul 2>nul
  if not errorlevel 1 set "NPM_BIN=npm.cmd"
)
if not defined NPM_BIN (
  echo [CAD] ERROR: npm is not available after Node install.
  pause
  exit /b 1
)

REM --- Clone repo if needed ---
if not exist "%APP_DIR%\package.json" (
  if "%CAD_REPO_URL%"=="https://github.com/YOUR_ORG/YOUR_CAD_REPO.git" (
    echo [CAD] ERROR: Set CAD_REPO_URL at top of this BAT to your real repository URL.
    pause
    exit /b 1
  )
  echo [CAD] No CAD source found. Cloning repository into "%APP_DIR%"...
  echo [CAD] Cloning to: %APP_DIR%
  git clone --branch "%CAD_REPO_BRANCH%" "%CAD_REPO_URL%" "%APP_DIR%"
  if errorlevel 1 (
    echo [CAD] ERROR: Repository clone failed.
    pause
    exit /b 1
  )
)

cd /d "%APP_DIR%"

REM --- Ensure we have a git repo ---
if not exist ".git" (
  echo [CAD] No .git directory found in %APP_DIR%.
  REM Try initializing git and connecting to the remote
  if "%CAD_REPO_URL%"=="https://github.com/YOUR_ORG/YOUR_CAD_REPO.git" (
    echo [CAD] ERROR: Directory is not a git repo and CAD_REPO_URL is not configured.
    echo [CAD] Set CAD_REPO_URL at the top of this BAT, then run again.
    pause
    exit /b 1
  )
  echo [CAD] Initializing git repo and connecting to remote...
  git init
  git remote add origin "%CAD_REPO_URL%"
  git fetch origin "%CAD_REPO_BRANCH%"
  if errorlevel 1 (
    echo [CAD] ERROR: Could not fetch from remote. Check CAD_REPO_URL.
    pause
    exit /b 1
  )
  git reset --hard "origin/%CAD_REPO_BRANCH%"
  if errorlevel 1 (
    echo [CAD] ERROR: Could not sync to origin/%CAD_REPO_BRANCH%.
    pause
    exit /b 1
  )
  git branch -M "%CAD_REPO_BRANCH%"
  git branch --set-upstream-to="origin/%CAD_REPO_BRANCH%" "%CAD_REPO_BRANCH%"
  echo [CAD] Git repo initialized and synced to origin/%CAD_REPO_BRANCH%.
)

if not exist ".env" (
  if exist ".env.example" (
    echo [CAD] Creating .env from .env.example...
    copy /Y ".env.example" ".env" >nul
  )
)
if not exist "server\data" mkdir "server\data"
if not exist "server\data\uploads" mkdir "server\data\uploads"

set "AUTO_UPDATE_BRANCH=%CAD_REPO_BRANCH%"
if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    set "_KEY=%%A"
    REM Skip blank lines
    if defined _KEY if /I "!_KEY!"=="AUTO_UPDATE_BRANCH" set "AUTO_UPDATE_BRANCH=%%B"
  )
)
if "%AUTO_UPDATE_BRANCH%"=="" set "AUTO_UPDATE_BRANCH=%CAD_REPO_BRANCH%"

:main_loop
set "LOCAL_HEAD="
set "REMOTE_HEAD="
set "UPDATED=0"
set "PACK_RESOURCES=0"

echo [CAD] Checking for updates on startup...
for /f %%I in ('git rev-parse HEAD 2^>nul') do set "LOCAL_HEAD=%%I"
git fetch origin %AUTO_UPDATE_BRANCH% --quiet
if errorlevel 1 (
  echo [CAD] WARNING: Could not fetch updates ^(network issue?^). Continuing with current version...
  goto :skip_update
)
for /f %%I in ('git rev-parse origin/%AUTO_UPDATE_BRANCH% 2^>nul') do set "REMOTE_HEAD=%%I"

if not defined REMOTE_HEAD (
  echo [CAD] WARNING: Could not determine remote HEAD. Skipping update.
  goto :skip_update
)

echo [CAD] Local: !LOCAL_HEAD! Remote: !REMOTE_HEAD!

if not defined LOCAL_HEAD (
  echo [CAD] No local commit detected. Syncing to origin/%AUTO_UPDATE_BRANCH%...
  git reset --hard origin/%AUTO_UPDATE_BRANCH%
  if errorlevel 1 goto :fail
  git clean -fd -e .env -e server/data/
  if errorlevel 1 goto :fail
  set "UPDATED=1"
) else if /I not "!LOCAL_HEAD!"=="!REMOTE_HEAD!" (
  echo [CAD] Update found. Applying...
  git reset --hard origin/%AUTO_UPDATE_BRANCH%
  if errorlevel 1 goto :fail
  git clean -fd -e .env -e server/data/
  if errorlevel 1 goto :fail
  set "UPDATED=1"
) else (
  echo [CAD] Already up to date.
)

:skip_update
if "!UPDATED!"=="1" (
  echo [CAD] Installing dependencies...
  call %NPM_BIN% install %NPM_INSTALL_FLAGS%
  if errorlevel 1 goto :fail

  echo [CAD] Building web app...
  call %NPM_BIN% run build
  if errorlevel 1 (
    echo [CAD] Build failed. Re-installing web workspace dev dependencies and retrying...
    call %NPM_BIN% install --workspace=web %NPM_INSTALL_FLAGS%
    if errorlevel 1 goto :fail
    call %NPM_BIN% run build
    if errorlevel 1 goto :fail
  )
) else (
  if not exist "node_modules" (
    echo [CAD] Dependencies missing. Running npm install...
    call %NPM_BIN% install %NPM_INSTALL_FLAGS%
    if errorlevel 1 goto :fail
  )
  if not exist "web\dist\index.html" (
    echo [CAD] Web build missing. Running npm run build...
    call %NPM_BIN% run build
    if errorlevel 1 (
      echo [CAD] Build failed. Re-installing web workspace dev dependencies and retrying...
      call %NPM_BIN% install --workspace=web %NPM_INSTALL_FLAGS%
      if errorlevel 1 goto :fail
      call %NPM_BIN% run build
      if errorlevel 1 goto :fail
    )
  )
)

REM Always re-package the FiveM resource pack on startup so cad_bridge-hosted NPWD
REM remotes and standalone NPWD app resources stay in sync. If the repo was not
REM updated, we can skip rebuilding the NPWD apps and just re-sync/repack.
set "PACK_RESOURCES=1"
if not exist "%RESOURCE_PACK_CAD_MANIFEST%" set "PACK_RESOURCES=1"
if not exist "%RESOURCE_PACK_VICROADS_MANIFEST%" set "PACK_RESOURCES=1"
if not exist "%RESOURCE_PACK_FINES_MANIFEST%" set "PACK_RESOURCES=1"
if not exist "%RESOURCE_PACK_CAD_VICROADS_REMOTE%" set "PACK_RESOURCES=1"
if not exist "%RESOURCE_PACK_CAD_FINES_REMOTE%" set "PACK_RESOURCES=1"
if not exist "%RESOURCE_PACK_VICROADS_REMOTE%" set "PACK_RESOURCES=1"
if not exist "%RESOURCE_PACK_FINES_REMOTE%" set "PACK_RESOURCES=1"
if "!PACK_RESOURCES!"=="1" (
  if exist "%RESOURCE_PACK_SCRIPT%" (
    where %POWERSHELL_BIN% >nul 2>nul
    if errorlevel 1 set "POWERSHELL_BIN=powershell.exe"
    set "RESOURCE_PACK_ARGS="
    if not "!UPDATED!"=="1" set "RESOURCE_PACK_ARGS=-SkipBuild"
    if defined RESOURCE_PACK_ARGS (
      echo [CAD] Packaging FiveM resources into %RESOURCE_PACK_DIR% ^(!RESOURCE_PACK_ARGS!^)...
      call %POWERSHELL_BIN% -NoProfile -ExecutionPolicy Bypass -File "%RESOURCE_PACK_SCRIPT%" !RESOURCE_PACK_ARGS!
    ) else (
      echo [CAD] Packaging FiveM resources into %RESOURCE_PACK_DIR%...
      call %POWERSHELL_BIN% -NoProfile -ExecutionPolicy Bypass -File "%RESOURCE_PACK_SCRIPT%"
    )
    if errorlevel 1 goto :fail
    if not exist "%RESOURCE_PACK_CAD_MANIFEST%" (
      echo [CAD] ERROR: Packaged resource missing cad_bridge manifest: %RESOURCE_PACK_CAD_MANIFEST%
      goto :fail
    )
    if not exist "%RESOURCE_PACK_VICROADS_MANIFEST%" (
      echo [CAD] ERROR: Packaged resource missing npwd_vicroads manifest: %RESOURCE_PACK_VICROADS_MANIFEST%
      goto :fail
    )
    if not exist "%RESOURCE_PACK_FINES_MANIFEST%" (
      echo [CAD] ERROR: Packaged resource missing npwd_fines_victoria manifest: %RESOURCE_PACK_FINES_MANIFEST%
      goto :fail
    )
    if not exist "%RESOURCE_PACK_CAD_VICROADS_REMOTE%" (
      echo [CAD] ERROR: Packaged cad_bridge bundle missing VicRoads remoteEntry: %RESOURCE_PACK_CAD_VICROADS_REMOTE%
      goto :fail
    )
    if not exist "%RESOURCE_PACK_CAD_FINES_REMOTE%" (
      echo [CAD] ERROR: Packaged cad_bridge bundle missing Fines Victoria remoteEntry: %RESOURCE_PACK_CAD_FINES_REMOTE%
      goto :fail
    )
    if not exist "%RESOURCE_PACK_VICROADS_REMOTE%" (
      echo [CAD] ERROR: Packaged npwd_vicroads bundle missing remoteEntry: %RESOURCE_PACK_VICROADS_REMOTE%
      goto :fail
    )
    if not exist "%RESOURCE_PACK_FINES_REMOTE%" (
      echo [CAD] ERROR: Packaged npwd_fines_victoria bundle missing remoteEntry: %RESOURCE_PACK_FINES_REMOTE%
      goto :fail
    )
    echo [CAD] Resource pack verified: cad_bridge + npwd_vicroads + npwd_fines_victoria
  ) else (
    echo [CAD] WARNING: Resource pack script not found: %RESOURCE_PACK_SCRIPT%
  )
)

echo [CAD] Using third-party communication configuration.

echo [CAD] Launching server...
set NODE_ENV=production
set AUTO_UPDATE_ENABLED=true
set AUTO_UPDATE_SELF_RESTART=false
set AUTO_UPDATE_EXIT_ON_UPDATE=true
echo [CAD] Running: %NPM_BIN% run start
echo.
call %NPM_BIN% run start
set "SERVER_EXIT=!ERRORLEVEL!"
echo.
echo [CAD] Server exited with code !SERVER_EXIT!.
if "!SERVER_EXIT!"=="0" (
  echo [CAD] Clean exit ^(likely auto-update restart^). Restarting in 2 seconds...
  timeout /t 2 /nobreak >nul
) else (
  echo [CAD] Server crashed. Restarting in 5 seconds...
  echo [CAD] If this keeps happening, check the error above and your .env configuration.
  timeout /t 5 /nobreak >nul
)
goto :main_loop

:fail
echo.
echo [CAD] Startup failed. See error above.
echo [CAD] Press any key to exit...
pause >nul
exit /b 1
