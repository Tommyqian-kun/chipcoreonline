
//NO_ISO /NO_LS 
//ISO_CTRL /PSO_CTRL /PSO_ACK /RET_SAVE /RET_RET
//AnalogPort /AonPort /DFTPort /ISOHPort /ISOLPort
//DSPort /SDPort /POFFPort
//FdthPort /FloatPort /

//DS: VDD_CORE
//RS: VDD_MM_CSS


module arv_top(

input   VDD_CORE, //#0.75v:0.7v:0.65V#
input   VDD_MM_CSS, //#0.65v:0.6v:0.55v#PSO 1#
input VDDM_CLPS, //#0.8v:0.75v:0.7v#PSO 2#
//input MCUJPEG_SRAM_DR,

input   VDD_PLL_HV_CSS, //#1.2v#
input VDD_PLL_PST_CSS, //#0.75v#
input VDD_PLL_REF_CSS, //#0.75v#
input     VSS, //#0V#


input   wire  [1:0]  pd_power_en_m_sys_camera, pd_power_en_d_sys_camera, //sserq //#PSO_CTRL#
output   wire [1:0]   pd_power_en_m_ack_sys_camera, //#PSO_ACK#
//input   wire  [1:0]  pd_power_en_dd_sys_camera, //#PSO_CTRL#
output   wire    pd_power_en_d_ack_sys_camera, //#PSO_ACK#

input   wire  [5:0]  pd_power_en_mdd_cam,//#PSO_CTRL#

input   wire  [5:0]  ps_iso_en_mem_dlps,pg_iso_en_mem_olps,//#ISO_CTRL#

input   wire [1:0]   pc_iso_en_mem_clps, //#ISO_CTRL#
input wire      pd_iso_en_mcu_jpeg, //#ISO_CTRL#

input   wire    pc_ret_save_ctrl, //#RET_SAVE#
input wire      pd_ret_ret_ctrl, //#RET_RES#



);
endmodule



