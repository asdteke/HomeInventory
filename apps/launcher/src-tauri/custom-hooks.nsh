!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "HomeInventory Local installed. Firewall settings are left under user control."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "HomeInventory Local uninstall started."
!macroend
