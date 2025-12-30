
# ISO -> LS -> ELS -> RET -> PSO

##############################################################
# ISO Power MCell
##############################################################
Type Index: 1
Cell Type: ISO
Cell Patn: ISOCLSRCD*D*BWP*H*P* ISOCLSTCD*D*BWP*H*P*
Path Type: data 
Ctrl Pin: ISO
DataIn Pin: I
DataOut Pin: Z
Primary Power: VDD
Backup Power: VDDS
Nwell Power: VNWELL
Pwell Power: VBB
Ground Pin: VSS
Function: (!ISO * I)
PD Function: ÅVDDS + VSS + VBB
Cell Name: ISOCLSRCIWFIRMZLGFD4BWP210H6P51CNODELVT

Type Index: 2
Cell Type: ISO
Cell Patn: ISOCLSRCC*D*BWP*H*P*
Path Type: clock
Ctrl Pin: ISO
DataIn Pin: I
DataOut Pin: Z
Primary Power: VDD
Backup Power: VDDS
Nwell Power: VNWELL
Pwell Power: VBB
Ground Pin: VSS
Function: (!ISO * I)
PD Function: ÅVDDS + VSS + VBB
Cell Name: ISOCLSRCCIWFIRMZLGFD4BWP210H6P51CNODELVT

##############################################################
# LS Power MCell
##############################################################
Type Index: 1
Cell Type: LS
Cell Patn: LVLCHSRC*D*BWP*H*P*
Path Type: data clock
DataIn Pin: I
DataOut Pin: Z
Primary Power: VDD
Backup Power: VDDS
Nwell Power: VNWELL
Pwell Power: VBB
Ground Pin: VSS
Function: (I + ISO)
PD Function: ÅVDDS + VSS + VBB
Cell Name: LVLCHSRCIWFIRMZLGFD4BWP210H6P51CNODELVT

##############################################################
# ELS Power MCell
##############################################################
Type Index: 1
Cell Type: ELS
Cell Patn: ELVLSCHSRC*D*BWP*H*P*
Path Type: data clock
Ctrl Pin: ISO
DataIn Pin: I
DataOut Pin: Z
Primary Power: VDD
Backup Power: VDDS
Nwell Power: VNWELL
Pwell Power: VBB
Ground Pin: VSS
Function: (I + ISO)
PD Function: ÅVDDS + VSS + VBB
Cell Name: LVLSCHSRCIWFIRMZLGFD4BWP210H6P51CNODELVT

##############################################################
# RET Power MCell
##############################################################
Type Index: 1
Cell Type: RET
Cell Patn: RETCHSRC*D*BWP*H*P*
Ctrl Pin: RET SAVE
DataIn Pin: D
DataOut Pin: Q
Primary Power: VDD
Backup Power: VDDS
Nwell Power: VNWELL
Pwell Power: VBB
Ground Pin: VSS
Function: (I + ISO)
PD Function: ÅVDDS + VSS + VBB
Cell Name: RETCHSRCIWFIRMZLGFD4BWP210H6P51CNODELVT

##############################################################
# PSW Power MCell
##############################################################
Type Index: 1
Cell Type: PSW
Cell Patn: HDXCHSRC*D*BWP*H*P*
Ctrl Pin: SLEEP ACK
Input Power: VDD
Output Power: VDDS
Nwell Power: VNWELL
Pwell Power: VBB
Ground Pin: VSS
Function: (I + ISO)
PD Function: ÅVDDS + VSS + VBB
Cell Name: HDXCHSRCIWFIRMZLGFD4BWP210H6P51CNODELVT

