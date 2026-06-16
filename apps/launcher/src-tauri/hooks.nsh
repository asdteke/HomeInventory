!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "HomeInventory Local installed. Firewall settings are left under user control."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "HomeInventory Local uninstalled."
!macroend
