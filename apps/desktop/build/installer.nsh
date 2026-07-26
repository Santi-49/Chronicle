# Chronicle keeps electron-builder's maintained assisted installer and changes
# only supported extension points. Do not replace the complete installer.nsi.

# If a human-approved license file is added to electron-builder's `nsis.license`
# option, present explicit checkbox acceptance rather than changing the legal
# page to custom HTML.
!define MUI_LICENSEPAGE_CHECKBOX
!define MUI_LICENSEPAGE_CHECKBOX_TEXT "I have read and accept the Chronicle license agreement"

!define MUI_FINISHPAGE_TITLE "Chronicle is ready"
!define MUI_FINISHPAGE_TEXT "Create your first project in about a minute. Chronicle will guide you through the real workspace after launch."

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Chronicle"
  !define MUI_WELCOMEPAGE_TEXT "Chronicle keeps a local version history for the creative folders you choose.$\r$\n$\r$\nOptional AI summaries use your configured provider. Local capture and restore keep working without an account or AI connection.$\r$\n$\r$\nClick Next to install Chronicle for your Windows account."
  !insertmacro MUI_PAGE_WELCOME
!macroend

# A per-user install avoids unnecessary administrator prompts and keeps the
# public hackathon build's setup path short. Existing installs retain their
# original scope during update/uninstall through electron-builder's detection.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

# "Start Chronicle when I sign in" is applied by Electron's
# app.setLoginItemSettings, which writes a per-user Run value. Uninstalling must
# remove it, or Windows keeps trying to launch a deleted executable at every
# sign-in and shows Chronicle as a startup app that no longer exists.
#
# The value name matches LOGIN_ITEM_NAME in src/main/system/login-item.ts, which
# passes it explicitly for exactly this reason. DeleteRegValue succeeds silently
# when the user never enabled the option.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Chronicle"
!macroend
