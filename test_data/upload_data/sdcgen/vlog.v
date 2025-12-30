


module jpeg_top_wrapx(

// #RelClock: clk_jpeg_ast#
input   wire  [1:0]  pd_power_en_m_sys_camera, // #MCP#
			pd_power_en_mdd_cam , instruction4,

input   wire  [1:0]		bus_request5, slave_ready7, 
	//	bus_request6, slave_ready8,
		bus_request7, slave_ready9 ,	
		bus_request8, slave_ready3,
		bus_request9,slave_ready33,
	//	bus_request45,slave_ready35,//#FP#
// #RelClock: clk_jpeg_ast#


// #RelClock: clk_jpeg_ast#
// main_bus ports
input wire [15:0]  dat0, dat1  , dat2, dat3,data, 
output reg [15 :0] address,
//output reg [ 3  :0] slave_instruction, //#FP#  
//input wire [5: 0] edt_ct, scan_in, // #DFT#
//output wire [5: 0] scan_out, dft_ctl, // #DFT#

//output reg slave_request,  //#MCP#
output reg bus_grant,
output wire mem_read,
output wire mem_write,
//input wire bus_request,
input wire slave_ready,

output reg [15 :0] jump_address,
input wire [ 7: 0] instruction9,
//output wire clk_jpg,  //#IDEAL# #TCLK#
//output wire clk_jpgx,  //#IDEAL# #TCLK#
//input wire clk_ref,  //#IDEAL# #TCLK#
//input wire clk_cr8,  //#IDEAL# #TCLK#

//input wire resetN, // #IDEAL#
input wire test_mode,
input tri0 mem_read,
input tri0 mem_write,

//input wire [8:0]  ana_gpt   , ana_spg, // #ANA#
//bit [0:7] array [0:255]
//input bit [9: 0] flag_gpt, // #CASE FP#

//bit, byte, shortint, int,and longint
//output logic [15:0] program_address, // #FALL#
output logic [ 7  :0] instructionw2,
input logic [15:0] jump_address,
input logic [ 7:0] next_instruction,
input bit [ 7 :0] arg,
input byte [ 7 :0] data_spg, addr_spg,
input wire [3:0][5: 0] dat_up,
input wire [3:0] datg_up[5: 0][2:0][7:0],

// #RelClock: clk_jpeg_ast#

// #RelClock: clk_jpeg_ast#
input bit BusMode, Addr, Sel, DataIn, Rd_DS, Wr_RW,
//input tri1 ci,   //#FP#  
output byte spg_mem,

//bit [7:0] [31:0] foo7 [1:5] [1:10], foo8 [0:255];
input bit req,
	bit clk_jpeg, // #TCLK#
	bit start,
//	logic [1:0] mode,//#FP#
	logic [7:0] addr,
input wire [7:0] data7,
output bit gnt,
	bit [2: 0] rdy,  //#FP# #CASE#

// #RelClock: clk_jpeg_ast#



);


endmodule
