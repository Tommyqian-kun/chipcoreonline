###########################################################################################################
# Section I:
# 	Naming Convention Definition for power structure implementation
# 	Supply group definition for boundary ports /hierarchy pins /inst /memory /macro /PAD, etc. 
# 	User must define different variables according to every power strategy
# 	User must follow The following naming rules with different surfix 
# 	Suggest to cover some other naming keywords such as clock /data and high /low and l2h /h2l 
# 	Use tcl_based style and can use find_objects /concat /lappend /append /...
# 	     [find_objects . -pattern "*" -object_type inst/port <-direction in/out/inout>] 
# ###########################################################################################################
#   @1 boundary ports:
#   	Supply ports: (set_port_attribute)
#   		xxx_spa_in /xxx_spa_out
#   		xxx_spa_inports /xxx_spa_outports
#   		xxx_exdspa_inports /xxx_exdspa_outports
#   		xxx_exdspa_in /xxx_exdspa_out
#
# 	ISO ports:
# 		xxx_iso_in /xxx_iso_out 
# 		xxx_iso_inports /xxx_iso_outports 
# 		xxx_exdiso_inports /xxx_exdiso_outports
# 		xxx_exdiso_in /xxx_exdiso_out
#		xxx_noiso_inports /xxx_noiso_outports
#		xxx_noiso_in /xxx_noiso_out
# 		xxx_ctliso_inports
# 		xxx_ctliso_in
# 		xxx_fdthiso_inports /xxx_fdthiso_outports
# 		xxx_fdthiso_in /xxx_fdthiso_out
#
# 	LS ports:
# 		xxx_ls_in /xxx_ls_out
# 		xxx_ls_inports /xxx_ls_outports
# 		xxx_exdls_inports /xxx_exdls_outports 
# 		xxx_exdls_in /xxx_exdls_out 
# 		xxx_nols_inports /xxx_nols_outports
# 		xxx_nols_in /xxx_nols_out
# 		xxx_fdthls_inports /xxx_fdthls_outports
# 		xxx_fdthls_in /xxx_fdthls_out
#
# 	RET ports:
# 		xxx_saveret_in /xxx_resret_in
# 		xxx_saveret_inports /xxx_resret_inports
#
# 	PSW ports:
# 		xxx_ctlpsw_in /xxx_ackpsw_in
# 		xxx_ctlpsw_inports /xxx_ackpsw_inports
# 	
# 	RPT ports:
# 		xxx_rpt_in /xxx_rpt_out
# 		xxx_rpt_inports /xxx_rpt_outports
# 		xxx_exdrpt_in /xxx_exdrpt_out
# 		xxx_exdrpt_inports /xxx_exdrpt_outports
#
# 	AON ports:
# 		xxx_aon_in /xxx_aon_out
# 		xxx_aon_inports /xxx_aon_outports
#
# 	analog ports:
# 		xxx_ana_in /xxx_ana_out /xxx_ana_inout
# 		xxx_ana_inports /xxx_ana_outports /xxx_ana_inoutports
#
#	
#
#   @2 hierarchy pins(internal):
#   	Supply hpins: (set_port_attribute)
#   		xxx_spa_inhpins /xxx_spa_outhpins
#   		xxx_exdspa_inhpins /xxx_exdspa_outhpins

# 	ISO hpins:
# 		xxx_iso_inhpins /xxx_iso_outhpins 
# 		xxx_exdiso_inhpins /xxx_exdiso_outhpins
#		xxx_noiso_inhpins /xxx_noiso_outhpins
# 		xxx_ctliso_inhpins
# 		xxx_fdthiso_inhpins /xxx_fdthiso_outhpins
#
# 	LS hpins:
# 		xxx_ls_inhpins /xxx_ls_outhpins
# 		xxx_exdls_inhpins /xxx_exdls_outhpins 
# 		xxx_nols_inhpins /xxx_nols_outhpins
# 		xxx_fdthls_inhpins /xxx_fdthls_outhpins
#
# 	RET hpins:
# 		xxx_saveret_inhpins /xxx_resret_inhpins
#
# 	PSW hpins:
# 		xxx_ctlpsw_inhpins /xxx_ackpsw_inhpins
#
# 	RPT hpins:
# 		xxx_rpt_inpins /xxx_rpt_outpins
# 		xxx_exdrpt_inpins /xxx_exdrpt_outpins
		
#
# 	AON hpins:
# 		xxx_aon_inhpins /xxx_aon_outhpins
#
# 	analog hpins:
# 		xxx_ana_inhpins /xxx_ana_outhpins /xxx_ana_inouthpins
#
#   @3 memory related:
#   	boundary ports:
#   		xxx_mempwr_iso(ls)_inports /xxx_mempwr_exdiso(exdls)_inports 
#   		xxx_memsd_iso(ls)_inports  /xxx_memsd_exdiso(exdls)_inports
#   		xxx_memdsp_iso(ls)_inports /xxx_memdsp_exdiso(exdls)_inports
#   		xxx_memack_iso(ls)_outports /xxx_memack_exdiso(exdls)_outports
#
#   	hierarchy pins:
#		xxx_mempwr_iso(ls)_inhpins /xxx_mempwr_exdiso(exdls)_inhpins
#		xxx_memsd_iso(ls)_inhpins /xxx_memsd_exdiso(exdls)_inhpins
#		xxx_memdsp_iso(ls)_inhpins /xxx_memdsp_exdiso(exdls)_inhpins
#		xxx_memack_iso(ls)_outhpins /xxx_memack_exdiso(exdls)_outhpins
#	
#	instance:
#   		xxx_memdlycell_insts
#   		xxx_memretcell_insts
#   		xxx_memaoncell_insts
#
#
#   @4 retention registers:
#   		xxx_ret_insts
#   		xxx_exdret_insts
#   		xxx_noret_insts
#   		xxx_ret_hinsts
#   		xxx_exdret_hinsts
#   		xxx_noret_hinsts

#
#   @5 instance related:
#   	reference instance:
#   		xxx_insts
#   		xxx_exd_insts
#   		
#   	hierarchy instance:
#   		xxx_hinsts
#   		xxx_exd_hinsts
#   		
#
#   @6 macro related:
#
#
#   @7 pad related:
#

# ctrl group definition for iso/psw/ret ctrl from internal pd

#
set mem_sd_memsd_ls_in "u_mcu_jpeg_pd_buf/pd_mem_pudelay_sd_mcu_jpeg"
set mem_sd_MEMXYZ_ls_inputs "u_mcu_jpeg_pd_buf/pd_mem_pudelay_sd_mcu_jpeg"
set mem_sd_memsd_ls_inports "u_mcu_jpeg_pd_buf/pd_mem_pudelay_sd_mcu_jpeg"
set mem_ack_memack_ls_outports  " \
                pd_power_en_d_ack_mcu_jpeg \
                pd_power_en_n_ack_mcu_jpeg \
                "
set mem_sd_memsd_ls_inhpins "u_mcu_jpeg_pd_buf/pd_mem_pudelay_sd_mcu_jpeg"
set mem_ack_memack_ls_outhpins  " \
                pd_power_en_d_ack_mcu_jpeg \
                pd_power_en_n_ack_mcu_jpeg \
                "

set mem_sd_memsd_exdls_in "u_mcu_jpeg_pd_buf/pd_mem_pudelay_sd_mcu_jpeg"
set mem_sd_memsd_exdls_inhpins "u_mcu_jpeg_pd_buf/pd_mem_pudelay_sd_mcu_jpeg"
set mem_sd_memsd_exdls_inputs "u_mcu_jpeg_pd_buf/pd_mem_pudelay_sd_mcu_jpeg"
set mem_ack_memack_exdls_outports  " \
                pd_power_en_d_ack_mcu_jpeg \
                pd_power_en_n_ack_mcu_jpeg \
                "

set cr8_high_ctliso_in  "u_mcu_jpeg_top/cr8_to_adb_jpeg_slv_si_to_mi_wakeup_async"
set cr8_high_ctliso_inhpins  "u_mcu_jpeg_top/cr8_to_adb_jpeg_slv_si_to_mi_wakeup_async"
set cr8_high_ctliso_inports  "u_mcu_jpeg_top/cr8_to_adb_jpeg_slv_si_to_mi_wakeup_async"

set cr8_high_iso_inports  "u_mcu_jpeg_top/cr8_to_adb_jpeg_slv_si_to_mi_wakeup_async \
                u_mcu_jpeg_top/cr8_to_adb_mcum0_slv_si_to_mi_wakeup_async \
                u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async \
                u_mcu_jpeg_top/cr8_to_adb_mcump_slv_si_to_mi_wakeup_async \
                u_ncu_jpeg_top/cr8_to_adb_mcum0_slv_aw_payld_async[554].abc/cde[90] \
                u_mcu_jpeg_top/cr8_to_adb_mcum0_slv_aw_payld_async[86]/rte[80] \
                u_mcu_jpeg_top/cr8_to_adb_mcum0_slv_aw_payld_async[242] \
                u_mcu_jpeg_top/cr8_to_adb_mcum0_slv_aw_payld_async[320] \
                u_mcu_jpeg_top/cr8_to_adb_mcum0_slv_aw_payld_async[476] \
                u_mcu_jpeg_top/cr8_to_adb_mcuml_slv_aw_payld_async[55] \
                "

set cr8_high_noiso_inports  "u_mcu_jpeg_top/cr8_to_adb_jpeg_slv_si_to_mi_wakeup_async \
                u_mcu_jpeg_top/cr8_to_adb_mcum0_slv_si_to_mi_wakeup_async"


set cr8_high_nols_inports "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_nols_inhpins "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_nols_in "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"

set pd_blk_mcu_iso_high_iso_outports "u_mcu_jpeg_top/pd_hw_hs_ack_mcu_jpeg_logic \
                         u_mcu_jpeg_top/pd_idle_mcu_jpeg \
                         "

set cr8_high_spa_in  "u_mcu_jpeg_top/cr8_to_adb_jpeg_slv_si_to_mi_wakeup_async"
set cr8_high_spa_inports  "u_mcu_jpeg_top/cr8_to_adb_jpeg_slv_si_to_mi_wakeup_async \
                u_mcu_jpeg_top/cr8_to_adb_mcum0_slv_si_to_mi_wakeup_async"


set cr8_high_exdspa_in "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_exdspa_inports "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_exdspa_inhpins "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"

set cr8_high_saveret_in "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_saveret_inports "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_resret_in "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_resret_inports "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_saveret_inhpins "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_resret_inhpins "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"

set cr8_high_ctlpsw_in "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_ctlpsw_inports "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_ackpsw_in "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_ackpsw_inports "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_ctlpsw_inhpins "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"
set cr8_high_ackpsw_inhpins "u_ncu_jpeg_top/cr8_to_adb_mcuml_slv_si_to_mi_wakeup_async"

set mcu2pll_input_high_iso_in "u_mcu_jpeg_top/u_camera_pll_FRAC_wrap/u_pll_sicr_lafracn_dft_wrapper/u_pll_sicr_lafracn_pwr_wrapper/SCANRSTB" 
set mcu2pll_input_high_exdiso_in "u_mcu_jpeg_top/u_camera_pll_FRAC_wrap/u_pll_sicr_lafracn_dft_wrapper/u_pll_sicr_lafracn_pwr_wrapper/SCANRSTB" 
set mcu2pll_input_high_iso_inports "u_mcu_jpeg_top/u_camera_pll_FRAC_wrap/u_pll_sicr_lafracn_dft_wrapper/u_pll_sicr_lafracn_pwr_wrapper/SCANRSTB" 
set mcu2pll_input_high_exdiso_inports "u_mcu_jpeg_top/u_camera_pll_FRAC_wrap/u_pll_sicr_lafracn_dft_wrapper/u_pll_sicr_lafracn_pwr_wrapper/SCANRSTB" 


# pd port
set pd_signal_ncu2aon_output_memack_ls_outports " \
        u_mcu_jpeg_pd_buf/pd_nem_pudelay_sd_mcu_jpeg \
        u_mcu_jpeg_pd_buf/pd_power_en_d_ack_mcu_jpeg \
        u_mcu_jpeg_pd_buf/pd_power_en_n_ack_mcu_jpeg \
        "

set pd_signal_aon2ncu_input_memsd_ls_inports     " \
        u_ncu_jpeg_pd_buf/pd_power_en_d_ncu_jpeg \
        u_mcu_jpeg_pd_buf/pd_power_en_n_mcu_jpeg  \
        u_mcu_jpeg_pd_buf/pd_cem_sd_mcu_jpeg \
        u_mcu_jpeg_pd_buf/pd_cem_ds_mcu_jpeg \
        u_mcu_jpeg_pd_buf/pd_mem_dslv_mcu_jpeg  \
        "

set pd_signal_ncu2aon_output_memack_exdls_outports " \
        u_mcu_jpeg_pd_buf/pd_nem_pudelay_sd_mcu_jpeg \
        u_mcu_jpeg_pd_buf/pd_power_en_d_ack_mcu_jpeg \
        u_mcu_jpeg_pd_buf/pd_power_en_n_ack_mcu_jpeg \
        "

set pd_signal_aon2ncu_input_memsd_exdls_inports     " \
        u_ncu_jpeg_pd_buf/pd_power_en_d_ncu_jpeg \
        u_mcu_jpeg_pd_buf/pd_power_en_n_mcu_jpeg  \
        u_mcu_jpeg_pd_buf/pd_cem_sd_mcu_jpeg \
        u_mcu_jpeg_pd_buf/pd_cem_ds_mcu_jpeg \
        u_mcu_jpeg_pd_buf/pd_mem_dslv_mcu_jpeg  \
        "


###########################################################################################################
# Section II:
# 	Build power distribution network and create all of supply connection
# 	Mapping supply name for all of instances and provide supply group relationship 
#	Every supply mapping group must have the same prefix name between insts/hinsts and outer_spy/inner_spy  
#	User must follow the following naming rule
###########################################################################################################
#   @1 instance related:
#   	reference instance:
#   		xxx_conspy_insts
#   		
#   	hierarchy instance:
#   		xxx_conspy_hinsts
#
#   @2 mappping supply port or net:
#   	supply port/net:
#   		xxx_outer_spy
#   	inst supply port:
#   		xxx_inner_spy
#
#   	
#
#
# Supply Mapping Group 1
set mcu_jpeg_conspy_hinsts     " \
        u_mcu_jpeg_pd_buf/u_wrap_d_jpeg \
        u_mcu_jpeg_pd_buf/u_wrap_x_jpeg  \
	"
set mcu_jpeg_outer_spy "VDD_CORE VDD_CLPS_PSW1 VSS"
set mcu_jpeg_inner_spy "VDDG VDDM VSS"

# Supply Mapping Group 2
set mcu_jpeg_mem_conspy_insts     " \
        u_mcu_jpeg_pd_buf/u_wrap_mem1_jpeg \
        u_mcu_jpeg_pd_buf/u_wrap_mem2_jpeg  \
	"
set mcu_jpeg_mem_outer_spy "VDD_CORE VDD_CLPS_PSW1 VDD_CLPS_PSW2 VSS"
set mcu_jpeg_mem_inner_spy "VDDG VDDM VDDT VSS"


