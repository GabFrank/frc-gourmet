; NSIS custom installer script para FRC Gourmet
; Doc: https://www.electron.build/configuration/nsis

!macro customHeader
  ; reservar ConfiguracionData en HKCU
!macroend

!macro preInit
  ; Default install dir per-user
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\FRC Gourmet"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\FRC Gourmet"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\FRC Gourmet"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\FRC Gourmet"
!macroend

!macro customInstall
  ; Hook post-install (placeholder)
!macroend

!macro customUnInstall
  ; Conservar la base de datos del usuario al desinstalar
  ; (deleteAppDataOnUninstall=false en package.json ya lo cubre)
!macroend
