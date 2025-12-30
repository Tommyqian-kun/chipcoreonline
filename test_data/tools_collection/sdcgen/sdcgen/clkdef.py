
import sys
import time
import os
import re

from os.path import dirname, abspath, basename

import  openpyxl

from .basesdc import *
from com.base import *


class ClkDefSheet(BaseSheet):
    def __init__(self,*args):
        super().__init__(*args)  
        self._hiertree = self._sdcdg._hier_tree
        
        self._sdcdir = self._sdcdg._sdcdir
        self._mdname = self._sdcdg._mdname
        self._alias = self._hiertree._blocks[self._mdname].alias #self._sdcdg._alias

        self._clkdata = {}  
        self._clknmdata = {}
        self._clknmlst = []

        self._clkvardata = {}
        #self._clkvarlinegs = ''

        self._rowcrgdata = {}
        self._iptcrgdata = {}
        self._iptcrglst  = {}
        self._crgals = {}

        self._rowipdata = {}
        self._iptipdata = {}
        self._iptiplst  = {}
        self._ipals = {}

        self._crgflg = 0
        self._ipflg = 0

        self._crgalsiptval = {}
        self._ipalsiptval = {}

        self._tclkdata = {}
        self._tclklst = {}

        # for crgip mstclk/srcpin/clkgrp
        #self._clkinfolst = []
        self._cycle_clkdeflst = []
        self._cycle_crgiplst = []
        #self._intgportlst = []

        self._crgipclknmals = {}

        self._hdportclks = {}
        self._hdportclksinfo = {}

        self._curhd_portclks = {}
        self._curhd_portclksinfo = {}

        # self._clkdef = {}
        # self._crgipclkdef = {}
        # self._hdportclkdef = {}
        self._curclkdef = {}

        self._lvl = 'blk'
        self._flt = 'IS_FLAT'   

    # def set_curclk_attr(self):

    def update_sheet(self):
        '''
        # only during -dg option
        # addition of crg files
        # addition of block hier tree expanded table from hier yaml
        '''
        sheet = self.get_sheet()
        self.read_crgip_data()

        # hiertree = self._sdcdg._hier_tree
        # alias = self._sdcdg._hier_tree._blocks[self._mdname].alias
        #indir = self._sdcdir + '/inputs'

        #if not self._tclklst:
        tclklst,tclkdata = self.concat_curhd_crgiphd_connect()
        

        # find TMCLK table
        start_rowg = self.find_sheet(sheet, 'TMCLK')

        varlist = ['clk_mcu_crt','clk_mcu_gen','clk_mcu_pll_crt','cllk_mcu_pll_gen','clk_mcu_virtual_crt','clk_mcu_totop_out','clk_mcu_topad_out','clk_mcu_tosys_out','clk_mcu_fdth_topad_out']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,1], [start_rowg + 10,1])

        # clkgrp
        #nvarlst = self.get_clkinfo_from_crgip(indir,self._mdname,'2')
        varlist = ['CGP1','CGP2','CGP3','CGP4','CGP5']
        #varlist += nvarlst
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,2], [start_rowg + 10,2])

        varlist = ['200M','400M|200M','1666M|800M|76M8']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,3], [start_rowg + 10,3])

        # waveform
        varlist = ['{0 2.5}','{1.0 4.2}','{0 4.0}|{0 5.0}']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,4], [start_rowg + 10,4])

        # divedge
        varlist = ['1','comb','1/2','1|2|{1 3 5}|comb','1/2|2 inv|{2 4 6}']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,5], [start_rowg + 10,5])

        # mstclk from crg_out/ip_out in header
        # varlistg = self.get_clkinfo_from_crgip('0','GEN')
        # nvar = [x.values() for x in varlistg]
        # xvar = [list(vl) for vl in nvar]
        # varlist = [i for g in xvar for i in g]
        #varlist = self._clkinfolst
        #print(varlist)

        # msclk
        varlist = []
        clknm = self.get_clkinfo_from_crgip('0','GEN')
        ipclk = []
        for x in clknm:
            for k,v in x.items():
                cials = k.split(' ')[0].split('_')[1]
                nalsck = [f'{cials} {x}' for x in v]
                ipclk.extend(nalsck)
        hdmstclk,hdintgclk,mdmstclk,mdintgclk = self.get_hdclk_dropdown()
        if ipclk:
            varlist.extend(ipclk)
        if hdmstclk:
            varlist.extend(hdmstclk)
        if varlist:
            self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,6], [start_rowg + 10,6])

        # portpin from vfile clk port
        varlist = []
        vdata = self._sdcdg._vfile_data
        vlist = self._sdcdg._vfile_list
        for kwd in vlist:
            if 'module_name' not in kwd and 'RelClock' not in kwd:
                if re.search(r'TCLK',vdata[kwd][2]):
                    varlist.append(kwd)
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,7], [start_rowg + 10,7]) 

        # clkintg from crg/ip header
        varlist = self.get_intgport_from_crgip()
        #varlist = [f'{alias}_{x}' for x in varlistg]
        #varlist = self._intgportlst
        if hdintgclk:
            varlist.extend(hdintgclk)
        if mdintgclk:
            varlist.extend(mdintgclk)
        if varlist:
            self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,8], [start_rowg + 10,8]) 
        else:
            sdc_info(f'Can not find clock connection from or to crg and ip.')

        # vol from hier yaml
        varlist = []
        for blknm in self._hiertree.get_curblks(self._mdname):
            blk = self._hiertree.get_block_by_name(blknm)
            pwrg = blk.prime_pwr.split(' ')[0].strip()
            if f'{pwrg}' not in varlist:
                varlist.append(pwrg)      
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,9], [start_rowg + 10,9]) 

        # comment 
        varlist = ['PLL_CRT','PLL_GEN','TOTOP_OUT','TOPAD_OUT','TOSYS_OUT','PHYGRP_A_1','PHYGRP_A_2','LOGGRP_B_1','LOGGRP_B_2']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,10], [start_rowg + 10,10]) 

    def get_hdclk_dropdown(self):
        hdmstclk = []
        hdintgclk = []
        mdmstclk = []
        mdintgclk = []
        # 'MCUJPEG_JPEG(val)_JPEG(var)':{'JPEG(var) HDIN clk_jpeg JPEG(val)_clk_jpeg_ast': []}
        if self._curhd_portclksinfo:
            for ky,vl in self._curhd_portclksinfo.items():
                for xr,yr in vl.items():
                    var = xr.split(' ')[0] 
                    val = xr.split(' ')[-1].split('_')[0]
                    kw = xr.split(' ')[1]
                    port = xr.split(' ')[2]
                    clknm = xr.split(' ')[3]
                    # outclktype in diginst and macinst
                    if kw == 'HDIN':
                        #mdmstclk.append(f'{var} {clknm}')
                        mdmstclk.append(f'{clknm}')
                        mdintgclk.append(f'{val}_HDIN {port}')
                    # mstclk/clkintg in clkdef 
                    if kw == 'HDOUT':
                        #mdmstclk.append(f'{var} {clknm}')
                        hdmstclk.append(f'{clknm}')
                        hdintgclk.append(f'{val}_HDOUT {port}')

        # if self._hdportclks:
        #     for ky in self._hdportclks.keys():
        #         als = ky.split('_')[1]
        #         # mstclk/clkintg in clkdef
        #         for ck in self._hdportclks[ky]['output']:
        #             port = ck.split(' ')[0]
        #             cknm = ck.split(' ')[1]
        #             hdmstclk.append(f'{als} {cknm}')
        #             hdintgclk.append(f'{als}_HDOUT {port}')  

        #         # outclktype in diginst and macinst
        #         for ck in self._hdportclks[ky]['input']:
        #             port = ck.split(' ')[0]
        #             cknm = ck.split(' ')[1]
        #             mdmstclk.append(f'{als} {cknm}')
        #             mdintgclk.append(f'{als}_HDIN {port}')
        
        return hdmstclk,hdintgclk,mdmstclk,mdintgclk


######################################################
    def read_data(self,kwd=''):
        sheet = self.get_sheet()
        self._clkdata = self.get_table_contxt(sheet)
        #print('_clkdata',self._clkdata)

        # self.read_crgip_data()

        self.get_curhd_clkportinfo_intg(self._mdname)   
        self._data = self._curhd_portclksinfo
        json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_curhd_portclksinfo.json'
        # json_file = self._sdcdir + '/json' + f'/curhd_portclksinfo.json'
        self.write_json(json_file)

        if kwd == 'json':
            if self._crgflg:
                for ky in list(self._rowcrgdata.keys()):
                    self._data = self._rowcrgdata[ky]
                    json_file = self._sdcdir + '/json' + f'/{ky.lower()}_header.json'
                    self.write_json(json_file)
                for ky in list(self._iptcrgdata.keys()):
                    self._data = self._iptcrgdata[ky]
                    json_file = self._sdcdir + '/json' + f'/{ky.lower()}_hlines.json'
                    self.write_json(json_file)                    
            if self._ipflg:
                for ky in list(self._rowipdata.keys()):
                    self._data = self._rowipdata[ky]
                    json_file = self._sdcdir + '/json' + f'/{ky.lower()}_header.json'
                    self.write_json(json_file)
                for ky in list(self._iptipdata.keys()):
                    self._data = self._iptipdata[ky]
                    json_file = self._sdcdir + '/json' + f'/{ky.lower()}_hlines.json'
                    self.write_json(json_file)

            if not self._clknmlst:
                self.get_clkdata_by_clkname(self._clkdata)
            self.get_hdinout_clkport(self._alias)
            self._data = self._hdportclks
            json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_hdclkport.json'
            # json_file = self._sdcdir + '/json' + f'/hdclkport.json'
            self.write_json(json_file)
            self._data = self._hdportclksinfo
            json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_hdclkportinfo.json'
            # json_file = self._sdcdir + '/json' + f'/hdclkportinfo.json'
            self.write_json(json_file)

        # self.get_curhd_clkportinfo_intg(self._mdname)   
        # self._data = self._curhd_portclksinfo
        # json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_curhd_portclksinfo.json'
        # self.write_json(json_file)

        # self.set_curclk_attr()
        # if kwd == 'json':
        #     self._data = self._clkdef
        #     json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_curhier_clkdef.json'
        #     self.write_json(json_file)
            # self._data = self._crgipclkdef
            # json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_curhier_crgipclkdef.json'
            # self.write_json(json_file)
            # self._data = self._hdportclkdef
            # json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_curhier_hdportclkdef.json'
            # self.write_json(json_file)

#{'MCUJPEG_MCUCRG1_MCRG': ['CRGIN_clk_mcu', 'CRGOUT_clk_jpg_out']}
#{'MCUJPEG_MCUCRG1_MCRG': {'CRGIN_clk_mcu': ['NAME_clk_66mcu_gen', 'HIER_clk65_mcu_gen', 'NAME_clk_mcu4_gen', 'None', 'None'], 'CRGOUT_clk_jpg_out': ['NAME_clk_jpg_out', 'HIER_clk_jpg_out', 'NAME_clk_jpg_out', 'IO|GEN|HDIN|IPIN|CRGIN', '200M|100M']}}
#{'MCUJPEG_MCUCRG1_MCRG': [['NAME_clk_66mcu_gen', 'HIER_clk65_mcu_gen', 'NAME_clk_mcu4_gen', 'None', 'None'], ['NAME_clk_jpg_out', 'HIER_clk_jpg_out', 'NAME_clk_jpg_out', 'IO|GEN|HDIN|IPIN|CRGIN', '200M|100M']]}
    def read_crgip_data(self):
        crgflg,crgfiles = self.get_macdig_info()
        ipflg,ipfiles = self.get_userip_info()
        print('get_userip_info:',ipflg,ipfiles)
        if crgflg:
            for als,fls in crgfiles.items():
                # als: 'MCUJPEG_MCUCRG10(val)_MCRG(var)_CRG'
                #als = self.parse_patn_cimd(xls)
                #als = als.replace(':','')
                als = als.replace('#','')
                rowcrgdata,iportcrgdata,iportcrg,crg_als = self.get_crgip_header(fls,f'{als}_CRG')
                self._rowcrgdata[als] = rowcrgdata
                self._iptcrgdata[als] = iportcrgdata
                self._iptcrglst[als] = iportcrg
                self._crgals[als] = crg_als
            #{'MCUJPEG_MCUCRG1_MCRG_CRG_Row12': {'IntgType': 'CRGIN', 'ClkPort': 'clk_npu', 'MstClkNm': 'NAME_clk_npu_gen', 'SrcPinNm': 'HIER_clk_npu_gen', 'ClkGrpNm': 'NAME_clk_npu_gen', 'OutClkType': 'None', 'ClkPeriod': 'None'}, }
            #print('rowcrgdata',rowcrgdata)

            for ncrgals in list(self._iptcrglst.keys()):
                tncrg = []
                for ncrgport,ncrgval in self._iptcrgdata[ncrgals].items():
                    #crghval.append(self._iptcrgdata[ncrg][ncrgport])
                    tncrg.append(ncrgval)
                self._crgalsiptval[f'{ncrgals}'] = tncrg
            #print('_crgalsiptval+++++++++++++++++++++++:',self._crgalsiptval)

        if ipflg:
            for als,fls in ipfiles.items():
                # als: 'MCUJPEG_MCUCRG10(val)_MCRG(var)_SOFT'
                #als = self.parse_patn_cimd(xls)
                als = als.replace('#','')
                rowipdata,iportipdata,iportip,ip_als = self.get_crgip_header(fls,f'{als}_IP')
                self._rowipdata[als] = rowipdata
                self._iptipdata[als] = iportipdata
                self._iptiplst[als] = iportip
                self._ipals[als] = ip_als
            #print('iportipdata',iportipdata)
        
            for nipals in list(self._iptiplst.keys()):
                tnip = []
                for nipport,nipval in self._iptipdata[nipals].items():
                    #iphval.append(self._iptipdata[nip][nipport])
                    tnip.append(nipval)
                self._ipalsiptval[f'{nipals}'] = tnip

        self._crgflg = crgflg
        self._ipflg = ipflg

        self.get_crgip_clknm_alias(self._mdname)

    def check_sheet(self):
        pass
    
    def change_sheet(self):
        pass

    def dump_json(self,json_file):
        self._data = self._clkdata
        self.write_json(json_file)

######################################################
    def write_sdc(self,sdc_dir,prousr=False):
        #sheet = self.get_sheet()
        #self._sdcdir = dirname(sdc_dir)
        #self._vardata = self.get_vardef_value(sheet)
        #dcdcnm = self._sdcdg._hier_tree._blocks[mdname].prime_pwr.split(' ')[0]
        #dcdcvl = self._sdcdg._hier_tree._blocks[mdname].prime_pwr.split(' ')[1:]
        #hierdcdc = self._sdcdg._hier_tree.get_hier_dcdc_by_name(mdname,hier=False)
        #blk = self._sdcdg._hier_tree._blocks[mdname]

        mdname = self._mdname # self._sdcdg._vfile_data['module_name']
        alias = self._hiertree._blocks[mdname].alias
        hdlvl = self._hiertree._blocks[mdname].hdlevel
        pwr = self._hiertree._blocks[mdname].prime_pwr
        self._alias = alias

        if hdlvl == 'sys':
            self._lvl = 'sys'
            self._flt = 'IS_CHIP'
        if hdlvl == 'blk':
            self._lvl = 'blk'
            self._flt = 'IS_FLAT'     

        # indir = dirname(sdc_dir) + '/inputs'
        # crgflg,crgfiles = self.get_macdig_info()
        # #ipflg,ipfiles = self.get_userip_info(mdname)

        #self.get_clkvar(mdname,alias,pwr)
        if not self._clknmlst:
            self.get_clkdata_by_clkname(self._clkdata)

        # sdc_file = sdc_dir +  f'{alias.lower()}_pllclk.sdc'
        # self.write_pllclk(mdname,alias,sdc_file)
        if self._crgflg:  
            # userclk        
            sdc_file = sdc_dir +  f'{alias.lower()}_userclk.sdc'
            self.write_userclk(alias,sdc_file,False)
            sdc_file = sdc_dir +  f'intg/{alias.lower()}_userclk_intg.sdc'
            self.write_userclk(alias,sdc_file,True)

            # updtclk
            sdc_file = sdc_dir +  f'{alias.lower()}_updtclk.sdc'            
            self.write_updtclk(mdname,alias,pwr,sdc_file,prousr, False)
            sdc_file = sdc_dir +  f'intg/{alias.lower()}_updtclk_intg.sdc'
            self.write_updtclk(mdname,alias,pwr,sdc_file,prousr,True)
        else:
            #clkdef
            sdc_file = sdc_dir +  f'{alias.lower()}_clkdef.sdc'
            self.write_clkdef(alias,sdc_file,False)  
            sdc_file = sdc_dir +  f'../intg/{alias.lower()}_clkdef_intg.sdc'
            self.write_clkdef(alias,sdc_file,True)      

    def write_clkdef(self,alias,sdc_file,fintg=False):
        clkdef_lines = ''
        for clknm in self._clknmlst:
            # crgip_outclk = self.is_crgiphd_toutclk(clknm)
            # if self.is_crtclk(clknm) and not crgip_outclk:
            if not fintg:
                if self.is_crtclk(clknm) and not self.is_pll_crtclk(clknm):
                    clkdef_lines += f'''
## created clock: {clknm}
if {{!$SDCVAR({self._flt},${{{alias}}})}} {{
    create_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -period $SDCVAR(CYCLE,${{{alias}}},{clknm}) $SDCVAR(WAVE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
}}
'''

                if self.is_pll_crtclk(clknm):
                    #print('created pllclk:',clknm)
                    clkdef_lines += f'''
## created internal or pll clock: {clknm}
create_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -period $SDCVAR(CYCLE,${{{alias}}},{clknm}) $SDCVAR(WAVE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
'''
            else:
                if self.is_pll_crtclk(clknm):
                    clkdef_lines += f'''
## created internal or pll clock: {clknm}
create_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -period $SDCVAR(CYCLE,${{{alias}}},{clknm}) $SDCVAR(WAVE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
'''

            if self.is_genclk(clknm):
                clkdef_lines += f'''
## generated clock: {clknm}
create_generated_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -master_clock $SDCVAR(NAME,MST,${{{alias}}},{clknm}) -source $SDCVAR(HIER,SRC,${{{alias}}},{clknm}) $SDCVAR(DIVDEGE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
'''

        self.save_text(clkdef_lines,sdc_file)

    def write_userclk(self,alias,sdc_file,fintg=False):
        userclk_lines = ''
        
        for clknm in self._clknmlst:
            #crgip_outclk = self.is_crgiphd_toutclk(clknm)
            if not fintg:
                if self.is_crtclk(clknm) and not self.is_pll_crtclk(clknm):
                    #print('created userclk:',clknm)
                    userclk_lines += f'''
## created clock: {clknm}
if {{!$SDCVAR({self._flt},${{{alias}}})}} {{
    create_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -period $SDCVAR(CYCLE,${{{alias}}},{clknm}) $SDCVAR(WAVE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
}}
'''
                if self.is_pll_crtclk(clknm):
                    #print('created pllclk:',clknm)
                    userclk_lines += f'''
## created inter or pll clock: {clknm}
create_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -period $SDCVAR(CYCLE,${{{alias}}},{clknm}) $SDCVAR(WAVE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
'''
            else:
                if self.is_pll_crtclk(clknm):
                    #print('created pllclk:',clknm)
                    userclk_lines += f'''
## created inter or pll clock: {clknm}
create_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -period $SDCVAR(CYCLE,${{{alias}}},{clknm}) $SDCVAR(WAVE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
'''

            if self.is_pll_genclk(clknm):
                userclk_lines += f'''
## generated pll clock: {clknm}
create_generated_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -master_clock $SDCVAR(NAME,MST,${{{alias}}},{clknm}) -source $SDCVAR(HIER,SRC,${{{alias}}},{clknm}) $SDCVAR(DIVDEGE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
'''

            if self.is_genclk(clknm) and not self.is_crgiphd_goutclk(clknm,'CRGOUT') and not self.is_crgiphd_goutclk(clknm,'IPOUT') and not self.is_crgiphd_goutclk(clknm,'HDOUT'):
                userclk_lines += f'''
## generated inter clock: {clknm}
create_generated_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -master_clock $SDCVAR(NAME,MST,${{{alias}}},{clknm}) -source $SDCVAR(HIER,SRC,${{{alias}}},{clknm}) $SDCVAR(DIVDEGE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
'''
        self.save_text(userclk_lines,sdc_file)

    def write_updtclk(self,mdname,alias,pwr,sdc_file,prousr=False, fintg=False):
        '''
        @ include CRG/IP outclk and internal genclk and outport genclk, not cover pll genclk
        @ include integration of sub updtclk.sdc 
        '''
#################################################################
    # clkintg: all clk vars & definition
    #   -CRGIN/IPIN/HDIN    ----> blkvar
    #   -CRGOUT             ---> updt
    #   -IPOUT              ---> subblk
    #   -HDOUT              ----> updt or subblk(nocrg)
    # outclktype from crg: only mstclk/srcpin/grpnm
    #   -CRGIN/HDIN/IPIN    -----> updt
    # outclktype from ip: only mstclk/srcpin/grpnm
    #   -CRGIN/HDIN/IPIN    -----> subblk    
#################################################################
        updtclk_lines = ''
        clknmlst = []
        clknmdata = {}
        for clknm in self._clknmlst:
            if self.is_crgiphd_goutclk(clknm,'CRGOUT'):
                clknmlst.append(clknm)
                clknmdata[clknm] = self._clknmdata[clknm]

        #updtclk_lines += self.get_clkvar(mdname,alias,pwr,self._clknmlst,self._clknmdata,fintg,'OUT')
        updtclk_lines += self.get_clkvar(mdname,alias,pwr,clknmlst,clknmdata,prousr, fintg,'CRGOUT')
        #updtclk_lines += self.get_clkvar(mdname,alias,pwr,self._clknmlst,self._clknmdata,fintg,'HDOUT')

        updtclk_lines += self.align_crgipoutclk_naming(mdname,'CRGOUT')

        for clknm in clknmlst:
            updtclk_lines += f'''

## generated clock: {clknm}
create_generated_clock -name $SDCVAR(NAME,${{{alias}}},{clknm}) -master_clock $SDCVAR(NAME,MST,${{{alias}}},{clknm}) -source $SDCVAR(HIER,SRC,${{{alias}}},{clknm}) $SDCVAR(DIVDEGE,${{{alias}}},{clknm}) $SDCVAR(HIER,${{{alias}}},{clknm}) -add -comment $SDCVAR(CMT,${{{alias}}},{clknm})
'''
        # crg/ip outclk name setting
        updtclk_lines += f'''
#############################################################
## Clk Variables from CRG to CRGIN/IPIN/HDIN
#############################################################
'''        
        updtclk_lines += self.set_mstsrcgrp_from_outclktype('CRGOUT')

        # sub harden blk
        if not fintg:         
            crgblks,ncrgblks = self.get_hierblks_wocrg(mdname)
            if crgblks:
                blkf = 'updt'
                updtclk_lines += self._hiertree.set_subblk_intg(mdname,blkf,crgblks,'partial')
            if ncrgblks:
                blkf = 'clkdef'
                updtclk_lines += self._hiertree.set_subblk_intg(mdname,blkf,ncrgblks,'partial')

        self.save_text(updtclk_lines,sdc_file)

#     def get_subclk_intg(self,name,balias,raliasg,rhierg,blvl,blkf):
#         lalias = balias.lower()
#         varg = f'''
# #############################################################
# ## Integration of {lalias}_{blkf}_intg.sdc
# #############################################################
# set {balias} "{raliasg}"
# if {{[info exists SDCVAR(IS_FLAT,${{{balias}}})]}} {{
# }} else {{
# 	set SDCVAR(IS_FLAT,${{{balias}}}) "1"
# }}

# if {{[info exists SDCVAR(LIB,${{{balias}}})]}} {{
# }} else {{
# 	set SDCVAR(LIB,${{{balias}}}) "0"
# }}

# if {{$SDCVAR(IS_FLAT,${{{balias}}}) && !$SDCVAR(LIB,${{{balias}}})}} {{
# 	if {{[file exists $SDCVAR(SDC_DIR,${{{balias}}})intg/{lalias}_{blkf}_intg.sdc]}} {{
# 		puts "SDC_INFO: Sourcing intg/{lalias}_{blkf}_intg.sdc."
# 		set SDCVAR(HIER,{blvl},${{{balias}}}) "{rhierg}"
# 		source -echo -verbose $SDCVAR(SDC_DIR,${{{balias}}})intg/{lalias}_{blkf}_intg.sdc
# 	}} else {{
# 		puts "SDC_ERROR: Missing intg/{lalias}_{blkf}_intg.sdc for integration. Please check it."
# 	}}
# }}

# '''
#         return varg

    # kw is 'CRGOUT'|'IPOUT'|'HDOUT'
    def is_crgiphd_goutclk(self,clk,kw='CRGOUT'):
        tclkdata,tclklst = self.concat_clkdef_crgiphd_gen_outclk()
        #clkintg = self._clknmdata[clk][6]
        clkintg = tclkdata[clk][6]
        if clkintg and kw in clkintg:
            return True
        
        elif self.is_genclk(clk):           
            clknmlst = self.get_srcclk(tclkdata,clk,srclst=[])
            mclkintg = tclkdata[clknmlst[1]][6]
            #crgip_clklst = self.get_crgip_clklst()            
            #if clknmlst[0] in crgip_clklst:
            if mclkintg and kw in mclkintg:
                return True
            else:
                return False
        else:
            return False 

    # should cover misc genclk from crg/ip outclk
    def is_crgiphd_toutclk(self,clk):
        tclkdata,tclklst = self.concat_clkdef_crgiphd_gen_outclk()
        #clkintg = self._clknmdata[clk][6]
        clkintg = tclkdata[clk][6]
        if clkintg and re.search(r'CRGOUT|IPOUT|HDOUT',clkintg):
            return True
        
        elif self.is_genclk(clk):           
            clknmlst = self.get_srcclk(tclkdata,clk,srclst=[])
            crgip_clklst = self.get_crgip_clklst()            
            if clknmlst[0] in crgip_clklst:
                return True
            else:
                return False
        else:
            return False                        

    # ['MCUCRG1_NAME_clk_npu_gen','MCUCRG1_NAME_clk_mcu_gen']
    def get_crgip_clklst(self):
        crgip_clklst = []
        ipcrgdata = {}
        if self._iptcrgdata:
            ipcrgdata.update(self._iptcrgdata)
        if self._iptipdata:
            ipcrgdata.update(self._iptipdata)
        if ipcrgdata:
            for cals,cval in ipcrgdata.items():
                for ky,vl in cval.items():
                    if vl[0] and not vl[0] in crgip_clklst:
                        nals = cals.split('_')[1]
                        nkey = f'{nals} {vl[0]}'
                        crgip_clklst.append(nkey)
        
        #print('get_crgip_clklst:+++++++++:',crgip_clklst)
        return crgip_clklst
    
    def get_hierblks_wocrg(self,mdname):
        hierblks = self._hiertree.get_hierlvlblks(mdname,outtype='hd')
        hblks = [x for x in hierblks if not x is mdname]
        blkwithcrg = []
        blknocrg = []

        crgflg = False
        for blk in hblks:
            curblks = self._hiertree.get_curblks(blk)               
            for bk in curblks:
                cblk = self._hiertree.get_block_by_name(bk)
                if cblk.hdlevel == 'crg':
                    crgflg = True
                    break
            
            if crgflg:
                blkwithcrg.append(blk)
            else:
                blknocrg.append(blk)

        return blkwithcrg,blknocrg
#############################################################
    def parse_patn_cimd(self,kw):
        nkw = ''

        sk = kw.split('_')
        if ':' in sk[1]:
            nals = sk[1].replace(':','')
        else:
            nals = sk[1]
        nkw = f'{sk[0]}_{nals}_{sk[2]}_{sk[3]}'

        return nkw

    def get_subhd_crgip_info(self,name,flg):        
        crgdic = {}
        blk = self._hiertree.get_block_by_name(name)

        #indir = self._sdcdir + '/inputs/mdblk'
        if self._hiertree.proj:
            indir = blk.constr_dir + f'sdcgen/outputs/intg'
        else:                   
            indir = self._sdcdir + f'/../../{name}/sdcgen/outputs/intg'
        
        #print('get_subhd_crgip_info+++++++++++++:indir:',indir)
        for kw in ['crg','pll']:
            crgdic.update(self._hiertree.get_macdig_by_name(name,kw,flg))

        #print('get_subhd_crgip_info+++++++++++++:crgdic:',crgdic)
        crg_flag = 0
        crg_files = {}
        if crgdic:
            if os.path.exists(indir):
                for kw,vl in crgdic.items():
                    # 'MCUJPEG_CRG1_CRG_CRG': 'clk_core';; CRG1 from inst_dig
                    # 'MCUJPEG_PLL1:1_PLL_PLL': 'pll_top_wrap'
                    nk = kw.split('_')  
                    fname1 = f'{vl}_pllclk'  
                    fname2 = f'{vl}_autoclk' 
                    # listdir ['cr8_core.sdc', 'clk_core.sdc']
                    fnlst = [x for x in os.listdir(indir) if fname1 in x or fname2 in x]
                    if fnlst:
                        for fnm in fnlst:
                            crg_files[kw] = f'{indir}/{fnm}'
                            crg_flag = 1
                            sdc_info(f'Find {nk[-1]} {nk[1]}: {fnm}')
                    else:
                        sdc_warn(f'Missing {nk[-1]} {nk[1]}: {vl}')

                # for fname in os.listdir(indir):
                #     for kw,vl in crgdic.items():                
                #         if vl in fname:
                #             crg_files[kw] = f'{indir}/{fname}'
                #             crg_flag = 1
            else:
                sdc_warn(f'Missing directory {indir}')

        print('get_subhd_crgip_info++++++++++++++:',crg_files)
        return crg_flag,crg_files
    
    def get_macdig_info(self,flg=''):
        crgdic = {}
        #ncrgdic = {}
        indir = self._sdcdir + '/inputs/mdblk'

        # userdic = self._hiertree.get_usersdc_by_name(self._mdname)
        for kw in ['crg','pll']:
            crgdic.update(self._hiertree.get_macdig_by_name(self._mdname,kw,flg))
        # if userdic:
        #     for ky in userdic.keys():
        #         for key,val in ncrgdic.items():
        #             if not ky == key:
        #                 crgdic[key] = val

        crg_flag = 0
        crg_files = {}
        if crgdic:
            if os.path.exists(indir):
                for kw,vl in crgdic.items():
                    # 'MCUJPEG_CRG1_CRG_CRG': 'clk_core';; CRG1 from inst_dig
                    # 'MCUJPEG_PLL1:1_PLL_PLL': 'pll_top_wrap'
                    nk = kw.split('_')  
                    fname = f'{vl}.sdc'  
                    # listdir ['cr8_core.sdc', 'clk_core.sdc']
                    if fname in os.listdir(indir):
                        crg_files[kw] = f'{indir}/{fname}'
                        crg_flag = 1
                        sdc_info(f'Find {nk[-1]} {nk[1]}: {fname}')
                    else:
                        sdc_warn(f'Missing {nk[-1]} {nk[1]}: {fname}')
            else:
                sdc_warn(f'Missing directory {indir}')

        #print(crg_files)
        return crg_flag,crg_files

    def get_userip_info(self,flg=''):
        indir = self._sdcdir + '/inputs/mdblk'
        userdic = self._hiertree.get_usersdc_by_name(self._mdname)

        ip_flag = 0
        ip_files = {}
        if userdic:
            for als,usr in userdic.items():
                if re.search(r'\[file\s+exi\w+\s+(\S+)\]',usr):
                    nusr = re.findall(r'\[file\s+exi\w+\s+(\S+)\]',usr)
                    #alsg = '_'.join(als.split('_')[:-1])
                    ip_files[als] = nusr[0]                    
                    ip_flag = 1
                    fn = nusr[0].split('/')[-1]
                    if f'{indir}/{fn}' not in nusr[0]:
                        sdc_warn(f'Different directory bet {indir}/{fn} and {nusr[0]}')
                else:
                    sdc_error(f'{als} of User_defined format is wrong.')

        ipdic = {}
        nipdic = {}
        for kw in ['soft','lib']:
            nipdic.update(self._hiertree.get_macdig_by_name(self._mdname,kw,flg))
        
        if nipdic:
            if os.path.exists(indir):
                for kw,vl in nipdic.items():
                    # 'MCUJPEG_GPY1_GPY_MACLIB': 'gpy_core';; GPY1 from inst_dig
                    # 'MCUJPEG_SPG1:1_SPG_DIGSOFT': 'spg_top_wrap'
                    if not kw in list(ip_files.keys()):
                        nk = kw.split('_')  
                        fname = f'{vl}.sdc'  
                        # listdir ['cr8_core.sdc', 'clk_core.sdc']
                        if fname in os.listdir(indir):
                            ip_files[kw] = f'{indir}/{fname}'
                            ip_flag = 1
                            sdc_info(f'Find {nk[-1]} {nk[1]}: {fname}')
                        else:
                            sdc_warn(f'Missing {nk[-1]} {nk[1]}: {fname}')
            else:
                sdc_warn(f'Missing directory {indir}')        

        # if userdic and nipdic:
        #     for ky in userdic.keys():
        #         if not ky in list(nipdic.keys()):
        #             sdc_warn(f'Can not find soft/lib "{ky}" in hier.yaml. Maybe usersdc "{ky}" hdlevel value not soft/lib')
        #     for ky in nipdic.keys():
        #         if not ky in list(userdic.keys()):
        #             sdc_warn(f'Can not find soft/lib "{ky}" in hier.yaml. Maybe missing usersdc block info which soft/lib {ky}')

        # # if ip_flag:
        #     for fname in os.listdir(indir):
        #         for kw,vl in ip_files.items():
        #             # lvl = vl.split(' ')[0]
        #             # mdn = vl.split(' ')[1]
        #             # xl = f'{kw}_{lvl}'
        #             # nkw = self.parse_patn_cimd(xl)
        #             nk = kw.split('_')
        #             if vl in fname:
        #                 ip_files[kw] = f'{indir}/{fname}'
        #                 ip_flag = 1
        #                 sdc_info(f'Find {nk[-1]} {nk[1]}: {fname}')
        #             # else:
        #             #     sdc_warn(f'Missing {nk[-1]} {nk[1]}: {fname}')

        return ip_flag,ip_files


    # ClkNm	ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment
    def get_clkdata_by_clkname(self,clkdata):
        #clkkeys = list(clkdata.keys())
        #if not self._clknmlst:
        clknmlst = []
        if clkdata:
            #clknmlst = [v['ClkNm'] for k,v in clkdata.items()]
            ncrg = {x:x.split('Row')[-1] for x,y in clkdata.items()}
            xcrg = sorted(ncrg.items(), key = lambda x:int(x[1]))           
            clst = [k for k,_ in xcrg]
            #print('get_clkdata_by_clkname++++++++++++++++++++++++:',ncrg,xcrg,clst)
            clknmlst = [clkdata[k]['ClkNm'] for k in clst]

            for key,clkrow in clkdata.items():
                kwlst = ['ClkGrp','Freq','WaveForm','DivEdge','MstClk',	'PortPin','ClkIntg','Vol','Comment']
                vallst = []

                for kw in kwlst:
                    #vallst.append(clkrow[kw])
                    if kw == 'MstClk':
                        mclk = clkrow['MstClk']

                        # hblk = self._hiertree.get_block_by_name(self._mdname)
                        # hdblks = hblk.get_curhd_by_name() 
                        # hdals = [] 
                        # for blk in  hdblks:
                        #     bk = self._hiertree.get_block_by_name(blk)
                        #     hdals(bk.alias)
                        if mclk:
                            if not mclk in clknmlst:
                                if ' ' in mclk.strip():
                                    vallst.append(mclk.strip())
                                else:
                                    sp = mclk.split('_')
                                    if 'NAME_' in mclk:
                                        val = sp[1]
                                    else:
                                        val = sp[0]
                                    var = self.get_als_var(self._mdname,val)
                                    #print('get_clkdata_by_clkname:mclk',val,var)
                                    vallst.append(f'{var} {mclk.strip()}')
                            else:
                                vallst.append(mclk)
                        else:
                            vallst.append(mclk)
                    else:
                        vallst.append(clkrow[kw])
        
                self._clknmdata[clkrow['ClkNm']] = vallst     
                #self._clknmlst.append(clkrow['ClkNm'])
            self._clknmlst = clknmlst
            
    
    def get_clkvar(self,mdname,alias,pwr,clknmlst,clknmdata,prousr=False,fintg=False,fmode='CRGIN'):
        prm = pwr.split(' ')[0].strip()
        vlg = pwr.split(' ')[1:]
        # per_dvfs = False
        # if prousr:
        #     sdc_info('User has profession permission.')
        #     per_dvfs = True
        # else:
        #     sdc_info('User has free permission.')
        #     per_dvfs = False

        dcvalx = []
        rcyclex = []
        rwavex = []
        rdivx = []

        clkvarlines = ''
        # nclknmlst = []
        # for clknm in clknmlst:
        #     if re.search(r'CRGOUT|IPOUT|HDOUT',fmode):
        #         if self.is_crgiphd_goutclk(clknm,fmode):
        #             nclknmlst.append(clknm)
        #     else:
        #         nclknmlst.append(clknm)

        for clknm in clknmlst:
            clkgrpg = clknmdata[clknm][0]
            freqg   = clknmdata[clknm][1]
            waveformg   = clknmdata[clknm][2]
            divedgeg = clknmdata[clknm][3]
            mstclkg = clknmdata[clknm][4]
            portpingg = clknmdata[clknm][5]
            clkintgg = clknmdata[clknm][6]
            volg = clknmdata[clknm][7]
            commentg = clknmdata[clknm][8]

            if not clkgrpg:
                clkgrp = ''
            else:
                clkgrp = clkgrpg
            if not freqg:
                freq = ''
            else:
                freq = freqg
            if not waveformg:
                waveform = ''
            else:
                waveform = waveformg

            if not divedgeg:
                divedge = ''
            else:
                divedge = divedgeg
            
            if not mstclkg:
                mstclk = ''
            else:
                mstclk = mstclkg
            if not portpingg:
                portping = ''
            else:
                portping = portpingg
            if not clkintgg:
                clkintg = ''
            else:
                clkintg = clkintgg
            if not volg:
                vol = ''
            else:
                vol = volg
            if not commentg:
                comment = 'NA'
            else:
                comment = commentg

            #print(clknm,clknmlst)
            npin = self.chg_reg_name(portping)
            if npin:
                portpin = npin
            else:
                portpin = portping
            # put into updt.sdc including variables and definition
            # if re.search(r'CRG?_OUT|IP?_OUT|HD?_OUT',clkintg):
            #     continue

            dcvol = ''
            dcval = ''          
            if vol:
                dcvol = vol
                dcval = self._hiertree._primepwr[vol].split(' ')
            else:
                dcvol = prm
                dcval = vlg

            # if len(dcval) > 1:
            #     if re.search(r'|',freq) or re.search(r'|',divedge):
            #         dvfs = 1

            if self.is_dvfsclk(clknm):
                if self.is_crtclk(clknm) and len(dcval) != len(freq.split('|')):
                    sdc_error(f'the dvfs number of freq for {clknm} in clkdef is not consistent with dcdc power from hier yaml.')
                if self.is_genclk(clknm) and len(dcval) != len(divedge.split('|')):
                    sdc_error(f'the dvfs number of divedge for {clknm} in clkdef is not consistent with dcdc power from hier yaml.')
                            

            clkvarlines += f'''
## Clock Definition: {clknm}
'''
            clkvarlines = clkvarlines.rstrip()

            # clknm
            if not re.search(r'^clk',clknm):
                rclknm = f'${{{alias}}}_clk_{clknm}'
            else:
                rclknm = f'${{{alias}}}_{clknm}'

            
            if self.is_crtclk(clknm):
                crtlst = []
                kwlst = ['NAME','HIER','CYCLE','WAVE','CMT']
                #if not re.search(r'\$|/|{|}',portpin)      
                if self.is_crtclk(clknm) and not self.is_pll_crtclk(clknm) and not fintg:
                    clkvarlines += f'''
if {{!$SDCVAR({self._flt},${{{alias}}})}} {{
'''          
                clkvarlines =  clkvarlines.rstrip()

                if not self.is_dvfsclk(clknm):
                    rfreq = freq.lower()
                    if not re.search(r'^clk',clknm):
                        rclknm = f'${{{alias}}}_clk_{clknm}'
                    else:
                        rclknm = f'${{{alias}}}_{clknm}'
                    if not portpin and not re.search(r'_vir|_virtual',clknm):
                        rclknm += f'_virtual'
                    if self.is_pll_crtclk(clknm) and not re.search(r'_pll',clknm):
                        rclknm += f'_pll'
                    if not re.search(r'_crt$',clknm):
                        rclknm += f'_crt_{rfreq}_nodvfs'
                    else:
                        rclknm += f'_{rfreq}_nodvfs'                    
                    crtlst.append(rclknm)
                    #print(f'{clknm}',rclknm)

                    # clkgrp

                    # hier
                    if re.search(r'\$|/|{|}',portpin):
                        rhier = f'[get_pins $SDCVAR(HIER,{self._lvl.upper()},${{{alias}}}){portpin}]'
                    else:
                        if portpin:
                            rhier = f'[get_ports {portpin}]'
                        else:
                            rhier = ' '
                    crtlst.append(rhier)

                    # cycle
                    rcycle = f'$SDCVAR(CYCLE{freq})'
                    crtlst.append(rcycle)

                    # wave
                    if self.has_wave(clknm):
                        rwave = f'-waveform {waveform}'
                    else:
                        rwave = ''
                    crtlst.append(rwave)

                    # comment
                    if not comment:
                        rcmt = clknm
                    else:
                        rcmt = comment
                    crtlst.append(rcmt)

                    clkvarlines += self.set_clkvar_from_clkdef(kwlst,clknm,alias,crtlst,fintg)
                    #clkvarlines += f'}}'
                    self._clkvardata[rclknm] = crtlst
                else:
                    rcycle = [f'$SDCVAR(CYCLE{x})' for x in freq.split('|')]
                    if waveform:
                        rwave = [x for x in waveform.split('|')]
                    else:
                        rwave = ['' for x in freq.split('|')]
                    #print('dvfs crt clk:',clknm,dcval,rcycle,rwave)
                    if prousr:
                        dcvalx = dcval
                        rcyclex = rcycle
                        rwavex = rwave
                    else:
                        dcvalx = [dcval[0]]
                        rcyclex = [rcycle[0]]
                        rwavex = [rwave[0]]

                    # print(dcvalx,rcyclex,rwavex)
                    for vlt,cyc,wav in zip(dcvalx,rcyclex,rwavex):
                        crtlst = []
                        clkvarlines += f'''
if {{$SDCVAR(DCDC_VL,${{{dcvol}}}) == "{vlt}"}} {{
'''
                        rfreq = cyc.split('CYCLE')[1].replace(')','').lower()
                        if not re.search(r'^clk',clknm):
                            rclknm = f'${{{alias}}}_clk_{clknm}'
                        else:
                            rclknm = f'${{{alias}}}_{clknm}'
                        if not portpin and not re.search(r'_vir|_virtual',clknm):
                            rclknm += f'_virtual'
                        if self.is_pll_crtclk(clknm) and not re.search(r'_pll',clknm):
                            rclknm += f'_pll'
                        if not re.search(r'_crt$',clknm):
                            rclknm += f'_crt_{rfreq}_dvfs'
                        else:
                            rclknm += f'_{rfreq}_dvfs'
                        crtlst.append(rclknm)
                        #print(f'{clknm}',rclknm)

                        # hier
                        if re.search(r'\$|/|{|}',portpin):
                            rhier = f'[get_pins $SDCVAR(HIER,{self._lvl.upper()},${{{alias}}}){portpin}]'
                        else:
                            if portpin and not self.is_virclk(clknm):
                                rhier = f'[get_ports {portpin}]'
                            else:
                                rhier = ''
                        if self.has_wave(clknm):
                            rwave = f'-waveform {wav}'
                        else:
                            rwave = ''
                        crtlst.append(rhier)                            
                        crtlst.append(cyc)
                        crtlst.append(rwave)
                        #print(vlt,cyc,rwave)

                        # comment
                        if not comment:
                            rcmt = clknm
                        else:
                            rcmt = comment
                        crtlst.append(rcmt)
                        
                        clkvarlines += self.set_clkvar_from_clkdef(kwlst,clknm,alias,crtlst,fintg)
                        clkvarlines += f'''

}}
'''
                        self._clkvardata[rclknm] = crtlst
                    # print('crt clkvarlines: ', clkvarlines)
                if re.search(r'CRGIN|IPIN|HDIN',clkintg) and 'IN' in fmode and not fintg:
                    msvals = self.set_mstsrcgrp_from_clkintg(alias,clkintg,'IN')                   
                    for val in msvals:
                        valg = val.split(' ')
                        clkvarlines += f'''
    set {valg[0]} "$SDCVAR(NAME,${{{alias}}},{clknm})"
    set {valg[1]}  "$SDCVAR(HIER,${{{alias}}},{clknm})"
'''

                if self.is_crtclk(clknm) and not self.is_pll_crtclk(clknm) and not fintg:
                    clkvarlines += f'''

}}
'''        
            
            if self.is_genclk(clknm):
                genlst = []
                kwlst = ['NAME','HIER','CYCLE','DIVDEGE','NAME,MST','HIER,SRC','CMT']                             
                if not self.is_dvfsclk(clknm):
                    if not freq:
                        nfreq,ndiv = self.cal_genclk_div_freq(clknm)
                        rfreq = nfreq[0].replace('CYCLE','').lower()
                        #print('nodvfsgenclk',nfreq)
                    else:
                        rfreq = freq.lower()
                    #print(clknm,rfreq)
                    if not re.search(r'^clk',clknm):
                        rclknm = f'${{{alias}}}_clk_{clknm}'
                    else:
                        rclknm = f'${{{alias}}}_{clknm}'
                    if re.search(r'TOTOP|TOPAD|TOSYS',comment):
                        rcmt = comment.strip().lower()
                        # rclknm += f'_{rcmt}_{rfreq}_nodvfs' 
                        if not re.search(r'_totop_out|_topad_out|_tosys_out',clknm):
                            if '&' in rcmt:
                                nrcmt = [x for x in rcmt.split('&') if 'to' in x]
                                rclknm += f'_{nrcmt[0].strip()}_{rfreq}_nodvfs'  
                    else:
                        if not re.search(r'_gen$',clknm):
                            rclknm += f'_gen_{rfreq}_nodvfs'
                        else:
                            rclknm += f'_{rfreq}_nodvfs' 
                    genlst.append(rclknm)
                    #print(f'{clknm}',rclknm)

                    # clkgrp

                    # hier
                    #oclkflg=False
                    if re.search(r'\$|/|{|}',portpin):
                        rhier = f'[get_pins $SDCVAR(HIER,{self._lvl.upper()},${{{alias}}}){portpin}]'
                    else:
                        rhier = f'[get_ports {portpin}]'
                        #oclkflg=True
                    genlst.append(rhier)

                    # cycle
                    rcycle = f'$SDCVAR(CYCLE{rfreq})'
                    genlst.append(rcycle)

                    #divedge
                    rdivedge = self.chg_divedge_format(divedge)
                    genlst.append(rdivedge)

                    #mstclk/srcpin
                    if re.search(r'CRGOUT|IPOUT|HDOUT',clkintg) and 'OUT' in fmode:
                        msvals = self.set_mstsrcgrp_from_clkintg(alias,clkintg,'OUT')
                        # ***** for HDIN on outclk port, need support & for multi loadingin future ??*****
                        mclk = msvals[0].split(' ')[0]
                        msrc = msvals[0].split(' ')[1]                         
                        rmstclk = f'${mclk}'
                        rsrcpin = f'${msrc}'
#                         for val in msvals:
#                             valg = val.split(' ')
#                             clkvarlines += f'''
# set {valg[0]} "$SDCVAR(NAME,${{{alias}}},{clknm})"
# set {valg[1]}  "$SDCVAR(HIER,${{{alias}}},{clknm})"
# '''                        
                    else:
                        rmstclk = f'$SDCVAR(NAME,${{{alias}}},{mstclk})'
                        rsrcpin = f'$SDCVAR(HIER,${{{alias}}},{mstclk})'
                    genlst.append(rmstclk)
                    genlst.append(rsrcpin)

                    # comment
                    if not comment:
                        rcmt = clknm
                    else:
                        rcmt = comment
                    genlst.append(rcmt)

                    clkvarlines += self.set_clkvar_from_clkdef(kwlst,clknm,alias,genlst,fintg)
                    #clkvarlines += f'}}'
                    self._clkvardata[rclknm] = genlst
                else:
                    if not freq:
                        # if not self.is_crgiphd_toutclk(clknm):
                        #     #rcycle = [f'$SDCVAR(CYCLE{x})' for x in clknmdata[mstclk][2].split('|')]
                        #     hfreq,hdiv = self.cal_genclk_div_freq(clknm)
                        #     rcycle = [f'$SDCVAR({x})' for x in hfreq]
                        # else:
                        #     # wrong cycles for outclk of crgip
                        #     tcycs = ['200M' for i in range(len(dcval))]
                        #     rcycle = [f'$SDCVAR(CYCLE{x})' for x in tcycs]
                        hfreq,hdiv = self.cal_genclk_div_freq(clknm)
                        rcycle = [f'$SDCVAR({x})' for x in hfreq]
                    else:
                        rcycle = [f'$SDCVAR(CYCLE{x})' for x in freq]
                    rdiv = [self.chg_divedge_format(x) for x in divedge.split('|')]
                    #print('DVFS GEN CLK:',clknm,dcval,rcycle,rdiv)

                    if prousr:
                        dcvalx = dcval
                        rcyclex = rcycle
                        rdivx = rdiv
                    else:
                        dcvalx = [dcval[0]]
                        rcyclex = [rcycle[0]]
                        rdivx = [rdiv[0]]
                    # print(dcvalx, rcyclex, rdivx)
                    if dcvalx and rcyclex and rdivx:
                        for vlt,cyc,div in zip(dcvalx,rcyclex,rdivx):
                            genlst = []
                            clkvarlines += f'''

if {{$SDCVAR(DCDC_VL,${{{dcvol}}}) == "{vlt}"}} {{
'''
                            clkvarlines =  clkvarlines.rstrip()
                            # how to cal multi_level gen clk freq ??
                            # mfreq = clknmdata[mstclk][2].replace('M','.')
                            # rfreq = self.cal_genclk_freq_single(mfreq,divedge).replace('.','m')
                            rfreq = cyc.split('CYCLE')[1].replace(')','').lower()
                            if not re.search(r'^clk',clknm):
                                rclknm = f'${{{alias}}}_clk_{clknm}'
                            else:
                                rclknm = f'${{{alias}}}_{clknm}'
                            if re.search(r'TOTOP|TOPAD|TOSYS',comment):
                                rcmt = comment.strip().lower()
                                if not re.search(r'_totop_out|_topad_out|_tosys_out',clknm):
                                    if '&' in rcmt:
                                        nrcmt = [x for x in rcmt.split('&') if 'to' in x]
                                        rclknm += f'_{nrcmt[0].strip()}_{rfreq}_dvfs'  
                            else:
                                if not re.search(r'_gen$',clknm):
                                    rclknm += f'_gen_{rfreq}_dvfs'
                                else:
                                    rclknm += f'_{rfreq}_dvfs' 
                            genlst.append(rclknm)
                            #print(f'{clknm}',rclknm)

                            # hier
                            if re.search(r'\$|/|{|}',portpin):
                                rhier = f'[get_pins $SDCVAR(HIER,{self._lvl.upper()},${{{alias}}}){portpin}]'
                            else:
                                rhier = f'[get_ports {portpin}]'

                            genlst.append(rhier)                            
                            genlst.append(cyc)
                            genlst.append(div)
    
                            #mstclk/srcpin
                            if re.search(r'CRGOUT|IPOUT|HDOUT',clkintg) and 'OUT' in fmode:
                                msvals = self.set_mstsrcgrp_from_clkintg(alias,clkintg,'OUT')
                                #print('set_mstsrcgrp_from_clkintg',clknm,msvals) 
                                # ***** for HDIN on outclk port, need support & for multi loadingin future ??*****
                                mclk = msvals[0].split(' ')[0]
                                msrc = msvals[0].split(' ')[1]                         
                                rmstclk = f'${mclk}'
                                rsrcpin = f'${msrc}'
#                                 for val in msvals:
#                                     valg = val.split(' ')
#                                     clkvarlines += f'''
# set {valg[0]} "$SDCVAR(NAME,${{{alias}}},{clknm})"
# set {valg[1]}  "$SDCVAR(HIER,${{{alias}}},{clknm})"
# '''                                  
                            else:
                                rmstclk = f'$SDCVAR(NAME,${{{alias}}},{mstclk})'
                                rsrcpin = f'$SDCVAR(HIER,${{{alias}}},{mstclk})'
                            genlst.append(rmstclk)
                            genlst.append(rsrcpin)

                            # comment
                            if not comment:
                                rcmt = clknm
                            else:
                                rcmt = comment
                            genlst.append(rcmt)

                            #print('mstsrc_crgip:',clknm,genlst)

                            clkvarlines += self.set_clkvar_from_clkdef(kwlst,clknm,alias,genlst,fintg)
                            clkvarlines += f'''

}}
'''
                            #print('clkvarlines:',self.set_clkvar_from_clkdef(kwlst,clknm,alias,genlst,fintg))
                            self._clkvardata[rclknm] = genlst
                    else:
                        sdc_error(f'need check clknm: {clknm}, dcval: {dcvalx}, rcycle: {rcyclex}, rdiv: {rdivx}.')
                    # print('gen clkvarlines: ', clkvarlines)
                if re.search(r'CRGIN|IPIN|HDIN',clkintg) and 'IN' in fmode:
                    msvals = self.set_mstsrcgrp_from_clkintg(alias,clkintg,'IN')
                    for val in msvals:
                        valg = val.split(' ')
                        clkvarlines += f'''
    set {valg[0]} "$SDCVAR(NAME,${{{alias}}},{clknm})"
    set {valg[1]}  "$SDCVAR(HIER,${{{alias}}},{clknm})"
'''
                                   
        clkvarlines = clkvarlines.rstrip()

        #if  re.search(r'CRGIN|IPIN',fmode):
        if 'IN' in fmode:
            # clkvarlines += self.set_clkperd_from_crgip(mdname)
           
            # clk group name and group list from clkdef
            # clkvarlines += self.set_grpvar_from_clkdef(alias,fintg)
            pass
        
#             if fintg:
#                 clkvarlines += f'''
# #############################################################
# ## Clk Variables from ClkDef to CRGIN/IPIN/HDIN
# #############################################################
# '''
#                 clkvarlines += self.align_crgipinclk_naming(alias,fintg)

            # sub harden blk
            if not fintg:
                blkf = self._lvl.lower() + 'var'
                clkvarlines += self._hiertree.set_subblk_intg(mdname,blkf,[],'full')

        # if re.search(r'CRGOUT|IPOUT',fmode):
        #     clkvarlines += self.align_crgipoutclk_naming(mdname,fmode)

        return clkvarlines

    def set_clkvar_from_clkdef(self,kwlst,clknm,alias,clklst,fintg=False,mode='IN'):
        varg = ''

        for kw,vl in zip(kwlst,clklst):
            if self.is_outclk(clknm) and kw == 'HIER' and re.search(r'get_ports',vl):
                rvl = vl.split(' ')[1].replace(']','')
                rvlg = f'[get_pins $SDCVAR(HIER,{self._lvl.upper()},${{{alias}}}){rvl}]'
                if not fintg:
                    varg += f'''
    if {{!$SDCVAR({self._flt},${{{alias}}})}} {{
        set SDCVAR({kw},${{{alias}}},{clknm}) "{vl}"
    }} else {{
        set SDCVAR({kw},${{{alias}}},{clknm}) "{rvlg}"
    }}
'''
                else:
                    varg += f'''
    set SDCVAR({kw},${{{alias}}},{clknm}) "{rvlg}"
'''                    
                varg = varg.rstrip()
#             elif self.is_crgiphd_toutclk(clknm) and kw == 'CYCLE':
#                 varg += f'''
#     set SDCVAR({kw},${{{alias}}},{clknm}) "{vl}"
# '''  
            else:
#                 if not fintg:
#                     varg += f'''
#     set SDCVAR({kw},${{{alias}}},{clknm}) "{vl}"
# '''                
#                 else:
#                     if self.is_pll_crtclk(clknm) or self.is_genclk(clknm):
#                         varg += f'''
#     set SDCVAR({kw},${{{alias}}},{clknm}) "{vl}"
# '''  
                varg += f'''
    set SDCVAR({kw},${{{alias}}},{clknm}) "{vl}"
    '''                                              
                varg = varg.rstrip()

        # if clknm =='clk_jpg_gen_out':
        #     print('clk_jpg_gen_out',varg)

        return varg

    def get_als_var(self,mdname,aval):
        als = ''
        blknm = self._hiertree.get_name_by_alias(mdname,aval)
        #print('get_als_var',blknm,aval)
        if blknm:
            if ' ' in blknm:
                blknm = blknm.split(' ')[0]
            blk = self._hiertree.get_block_by_name(blknm)
            als = blk.alias
        else:
            sdc_error(f'Can not find blknm through {aval} in {mdname}')

        return als

    def align_crgipinclk_naming(self,alias,fintg):
        pass
        # clkvarlines = ''

        # crgipindata = {}
        # crgipinclk = {}
        # if self._iptcrgdata:
        #     crgipindata.update(self._iptcrgdata)
        # if self._iptcrgdata:
        #     crgipindata.update(self._iptipdata)
#         for kl,vl in crgipindata.items():
#             cilst = []
#             for sk,sv in vl.items():
#                 if 'CRGIN' in sk or 'IPIN' in sk:
#                     cilst.append(sv[0])
#                     cilst.append(sv[1])
#                     cilst.append(sv[2])
#             crgipinclk[kl] = cilst
                    
#         for nk,nv in crgipinclk.items():
#             als = nk.split('_')[2]
#             clkvarlines += f'''                 
# set {nv[0]} SDCVAR(NAME,${{{als}}},{vst[0]})  "${vst[0]}"
# set SDCVAR(HIER,${{{als}}},{vst[1]})  "${vst[1]}"
# set SDCVAR(GRPNM,${{{als}}},{vst[2]})  "${vst[2]}"
# '''

    def align_crgipoutclk_naming(self,mdname,fmode):
        nmhgrp = {}
        clkvarlines = ''
        
        # {'MCUJPEG_MCUCRG1': [['NAME_clk_pll_gen', 'HIER_clk_pll_gen', 'NAME_clk_pll_gen', 'None', '300M|250M|200M'], 
        # ['NAME_clk_mcu_gen', 'HIER_clk_mcu_gen', 'NAME_clk_mcu_gen', 'None', '200M'], 
        # ['NAME_clk_jpg_gen', 'HIER_clk_jpg_gen', 'NAME_clk_jpg_gen', 'None', 'None'], 
        # ['NAME_clk_jpg_out', 'HIER_clk_jpg_out', 'NAME_clk_jpg_out', 'IO|GEN|HDIN|IPIN|CRGIN', '800M|500M|260M']]}
        
        crgalsiptval = {}
        if 'CRGOUT' in fmode:
            crgalsiptval.update(self._crgalsiptval)
        if 'IPOUT' in fmode:
            crgalsiptval.update(self._ipalsiptval)
        #print('crgalsiptval:',crgalsiptval)
        #{'MCUJPEG_CR8_CR8': [['CR8_NAME_clk_npu_gen', 'CR8_HIER_clk_npu_gen', 'CR8_NAME_clk_npu_gen', 'None', 'None', 'CR8'],[]]
        for cals,cval in crgalsiptval.items():
            #als = self.get_als_var(mdname,cals)
            var = cals.split('_')[2]
            #val = cals.split('_')[1]
            ncell = ''
            nlst = []
            for vl in cval:
                # nvl = ['_'.join(x.split('_')[1:]) for x in vl if '_' in x]
                # ncell = f'{val}_{nvl[0]} {val}_{nvl[1]} {val}_{nvl[2]}'
                ncell = f'{vl[0]} {vl[1]} {vl[2]}'
                nlst.append(ncell)
            nmhgrp[var] = nlst

            for als,val in nmhgrp.items():
                for vl in val:
                    vst = vl.split(' ')
                    clkvarlines += f'''
                    
set SDCVAR(NAME,${{{als}}},{vst[0].strip()})  "${vst[0].strip()}"
set SDCVAR(HIER,${{{als}}},{vst[1].strip()})  "${vst[1].strip()}"
set SDCVAR(GRPNM,${{{als}}},{vst[2].strip()})  "${vst[2].strip()}"
'''

        return clkvarlines

    def is_crtclk(self,clk):
        divedge = self._clknmdata[clk][3]
        mstclk = self._clknmdata[clk][4]
        if not divedge and not mstclk:
            return True
        else:
            return False
        
    def is_inps_crtclk(self,clknmdata,clk):
        portpin = clknmdata[clk][5]
        if portpin and  portpin in self._sdcdg._vfile_data:
            portdir = self._sdcdg._vfile_data[portpin][0]
            if portdir == 'input' and self.is_crtclk(clk):
                return True
            else:
                return False        

    def is_oups_genclk(self,clknmdata,clk):
        portpin = clknmdata[clk][5]
        if portpin and portpin in self._sdcdg._vfile_data:
            portdir = self._sdcdg._vfile_data[portpin][0]
            if portdir == 'output' and self.is_genclk(clk):
                return True
            else:
                return False
           
    def has_wave(self,clk):
        wave = self._clknmdata[clk][2]
        if wave:
            return True
        else:
            return False

    # include all of genclk which pll genclk, out genclk, internal genclk
    def is_genclk(self,clk):
        divedge = self._clknmdata[clk][3]
        mstclk = self._clknmdata[clk][4]
        if divedge and mstclk:
            return True
        else:
            return False

    def is_pllclk(self,clk):
        cmt = self._clknmdata[clk][8]
        if re.match(r'.+(_pll_crt|_pll_gen)$', clk):
            return True
        elif cmt:
            if 'PLL' in cmt:
                return True
        else:
            return False
                    
    def is_pll_crtclk(self,clk):
        cmt = self._clknmdata[clk][8]
        if re.match(r'.+(_pll_crt)$', clk) and self.is_crtclk(clk):
            return True
        elif cmt:
            if 'PLL_CRT' in cmt and self.is_crtclk(clk):
                return True
        else:
            return False
        
    def is_pll_genclk(self,clk):
        cmt = self._clknmdata[clk][8]
        if re.match(r'.+(_pll_gen)$', clk) and self.is_genclk(clk):
            return True
        elif cmt:
            if 'PLL_GEN' in cmt and self.is_genclk(clk):
             return True
        else:
            return False      

    def is_virclk(self,clk):
        portpin = self._clknmdata[clk][5]
        if re.match(r'.+(_vir_crt|_virtual_crt)$', clk):
            return True
        elif not portpin:
            return True
        else:
            return False
        
    def is_dvfsclk(self,clk):
        divedge = self._clknmdata[clk][3]
        freq = self._clknmdata[clk][1]

        if divedge:
            if '|' in divedge:
                return True
        elif freq:
            if '|' in freq:
                return True
        else:
            return False
                
    def is_outclk(self,clk):
        cmt = self._clknmdata[clk][8]

        if re.match(r'.+(_topad_out|_totop_out|_tosys_out)$', clk):
            return True
        elif cmt:
            if re.search(r'TOTOP|TOPAD|TOSYS',cmt):
                return True
        else:
            return False


    # def cal_genclk_freq_single(self,div,freq='200'):
    #     if re.match(r'^\d+$',div) and div != '1' and div != 'comb':
    #         nfreq = round(int(freq)/int(div),2)
    #         ndiv = div
    #     elif re.match(r'^\{\d+(\s+\d+)*\}',div):
    #         nums = re.sub(r'\D','',div).split(' ')
    #         nfreq = round(int(freq)/(int(nums[2]) - int(nums[0])/2),2)
    #         ndiv = str((int(nums[2]) - int(nums[0]))/2)
    #     elif re.match(r'^\d+/\d+',div):
    #         nfreq = round(int(freq) * int(div.split('/')[1]),2)
    #         ndiv = div.split('/')[1] +'_MUL'
    #     else:
    #         nfreq = freq
    #         ndiv = 1
        
    #     return nfreq,ndiv

    def chg_divedge_format(self,div):
        if re.match(r'^\d+$',div):
            rdivedge = f'-divide_by {div}'
        elif re.match(r'^\d+\s+inv$',div):
            dv = div.split(' ')[0]
            rdivedge = f'-divide_by {dv} -invert'
        elif re.match(r'^\{\d+(\s+\d+)*\}',div):
            rdivedge = f'-edges {div}'
        elif re.match(r'^comb',div):
            rdivedge = f'-divide_by 1 -combinational'
        elif re.match(r'^\d+/\d+',div):
            mul = div.split('/')[1]
            rdivedge = f'-multiply_by {mul}'

        return rdivedge

    def get_srcclk(self,tclkdata,genclk,srclst=[]):
        srclst.append(genclk)
        #divedge = self._clknmdata[genclk][3]
        #mstclk = self._clknmdata[genclk][4]
        if genclk in tclkdata:
            divedge = tclkdata[genclk][3]
            mstclk = tclkdata[genclk][4]
            if divedge and mstclk:
                self.get_srcclk(tclkdata,mstclk,srclst)
        # else:
        #     sdc_info(f'Not Found {genclk} in current hdhier clk list.')

        return srclst[::-1]

    def cal_genclk_div(self,div):
        ndiv = ''
        if re.match(r'\d+$',div):
            ndiv = f'{div}d'
        if re.match(r'^1//\d+$',div):
            ndiv = div.split('/')[1] + 'm'
        if re.match(r'^\{(\d+)(\s+\d+)*\}$',div):
            nums = re.sub(r'\D','',div)
            ndiv = str(int((int(nums[2]) - int(nums[0]))/2)) + 'd'
        if re.match(r'^\d+\s+inv$',div):
            ndiv = div.split(' ')[0] + 'd'
        if div == 'comb':
            ndiv = '1d'

        return ndiv

    # cover crg/ip/hd outclk
    def concat_clkdef_crgiphd_gen_outclk(self):
        tclkdata = {}
        tclklst = []
        crgipdata = {}
        crgipdata.update(self._iptcrgdata)
        crgipdata.update(self._iptipdata)
        #print('concat_clkdef_crgiphd_gen_outclk:++++++++++++++:',crgipdata)
        
        #crg/ip outclk
        if crgipdata:
            for cals,cval in crgipdata.items():
                for ky,vl in cval.items():
                    nals = cals.split('_')[2]
                    nky = f'{nals} {vl[0]}'
                    #nky = f'{vl[0]}'
                    if 'GEN' in vl[3]:
                        if not nky in tclklst:
                            #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment
                            tclkdata[nky] = [f'{vl[2]}',f'{vl[4]}','','','','','','','']                        
                            tclklst.append(nky)
                        if not vl[4]:
                            sdc_error(f'missing ClkPerd value {vl[0]} in CRG {cals}.')
        # hdout
        # {'MCUJPEG_JPEG':{'input': ['clk_npu clk_mcu_npu','clk_mcu clk_mcu_spg'],'output': ['clk_jpgx clk_jsp_out_gen_out']}}  
        #{'MCUJPEG_JPEG_JPEG': {'JPEG HDIN clk_cr8 clk_cr8_spg': ['CGP1', '600M', '{0 2.5}', '', '', 'clk_cr8', 'None', 'None', 'None'], 
        #  'JPEG HDOUT clk_jpgx clk_jxxsp_out_gen_out': ['$SDCVAR(NAME,${JPEG},clk_jsp_gen)', 'None', 'None', '3|2|{1 3 5}', 'clk_jsp_gen', 'clk_jpgx', 'None', 'None', 'TOPAD_OUT & LOGGRP_A_4']}}
        if self._curhd_portclks:
            for hals,hval in self._curhd_portclks.items():
                for ky,vl in hval.items():
                    if ky == 'output':
                        nals = hals.split('_')[1]
                        nval = hals.split('_')[0]
                        for v in vl:
                            port = v.split(' ')[0]
                            cknm =  v.split(' ')[1]
                            nky = f'{nals} {nval}_{cknm}'
                            #nky = f'{als} {kw} {port} {clknm}'
                            cky = f'{self._alias}_{nval}_{nals}'
                            pky = f'{nals} HDOUT {port} {nval}_{cknm}'                           
                            #print('_curhd_portclksinfo',self._curhd_portclksinfo)
                            gnm = self._curhd_portclksinfo[cky][pky][0]
                            # if not gnm in cknm:
                            #     gnm = f'{nals}_{gnm}'
                            feq = self._curhd_portclksinfo[cky][pky][1]
                            if not nky in tclklst:
                                #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment
                                tclkdata[nky] = [f'{gnm}',f'{feq}','','','',f'{port}','','','']                        
                                tclklst.append(nky)

        tclklst.extend(self._clknmlst)
        tclkdata.update(self._clknmdata)

        return  tclkdata, tclklst  

    # besides clkdef, and also cover all of genclk from crg/ip outclk
    def cal_genclk_div_freq(self,genclk):
        # crgip_clknm = self.get_clkinfo_from_crgip('0','GEN')
        # crgip_clkperd = self.get_clkinfo_from_crgip('4','GEN')
        
        # ciclknm = [vl for x in crgip_clknm for ky,vl in x.items()]
        # ciclkperd = [vl for x in crgip_clkperd for ky,vl in x.items()]
        # for key in crgip_clknm.keys():
        tclkdata = {}
        tclklst = []
        tclkdata,tclklst = self.concat_clkdef_crgiphd_gen_outclk()
        #print('cal_genclk_div_freq:tclkdata',tclkdata)

        clknmlst = self.get_srcclk(tclkdata,genclk,srclst=[])
        #print('cal_genclk_div_freq:clknmlst',genclk,clknmlst,tclkdata)
        if clknmlst:
            #freq = self._clknmdata[clknmlst[0]][1].strip()
            if tclkdata[clknmlst[-2]][1]:
                freq = tclkdata[clknmlst[-2]][1].strip()
            else:
                freq = tclkdata[clknmlst[0]][1].strip()
            #print('cal_genclk_div_freq:freq:clknmlst',freq,clknmlst[-2])
            freq = freq.replace('CYCLE','')
            cfreq = ''
            if '|' in freq:
                for frq in freq.split('|'):
                    if re.match(r'^\d+M\d+$',frq):
                        cfreq += frq.replace('M','.') + ' '
                    if re.match(r'^\d+M$',frq):
                        cfreq += frq.replace('M','') + ' '
            else:
                if re.match(r'^\d+M\d+$',freq):
                    cfreq = freq.replace('M','.')
                if re.match(r'^\d+M$',freq):
                    cfreq = freq.replace('M','')   
        else:
            sdc_error(f'Can not find master clock of {genclk}')   

        gfreq = []
        gdiv = []
        mdiv = []
        
        for clknm in clknmlst[1:]:
            #print(clknm)
            #ndiv = self._clknmdata[clknm][3] 
            ndiv = tclkdata[clknm][3]
            if '|' in ndiv:
                pdiv = []
                for div in ndiv.split('|'):
                    pdiv.append(self.cal_genclk_div(div.strip()))
                mdiv.append(pdiv)
            else:
                mdiv.append(self.cal_genclk_div(ndiv.strip()))
            #print('clkfreq',clknm,mdiv)
        
        if isinstance(mdiv[0],str):
            ffreq = ''
            fdiv = '1'
            for dv in mdiv:
                flg = ''
                if 'd' in dv:
                    fdiv = str(int(fdiv) * int(dv.replace('d',''))) 
                    flg = 'div'
                if 'm' in dv:
                    fdiv = str(int(fdiv) * int(dv.replace('m','')))  
                    flg = 'mul' 
            if flg == 'div':
                ffreq = str(round(float(cfreq) / int(fdiv),2))
            if flg == 'mul':
                fdiv = '1/' + fdiv
                ffreq = str(round(float(cfreq) * int(fdiv),2))
            #print(fdiv,ffreq)
            #print('oooooop')

            gdiv = list(fdiv)
            if '.0' in ffreq:
                ffreq = ffreq.replace('.0','M')
            elif '.00' in ffreq:
                ffreq = ffreq.replace('.00','M')
            else:
                ffreq = ffreq.replace('.','M')
            gfreq = f'CYCLE{ffreq}'.split()
            
        if isinstance(mdiv[0],list):
            ffreq = ''            
            fdivg = ''
            f1 = []
            f2 = []
            if len(mdiv) == 1:
                f1 = mdiv[0]
                f2 = [[x] for x in f1]
            else:               
                for i in range(0,len(mdiv[0])):
                    f1 = []
                    for j in range(0,len(mdiv)):
                        f1.append(mdiv[j][i])
                    f2.append(f1)
            #print(f1,f2)
            #print('etewqghhg')

            for sdv,feq in zip(f2,cfreq.split(' ')):
                fdiv = '1'
                for odv in sdv:
                    flg = ''                    
                    if 'd' in odv:
                        fdiv = str(int(fdiv) * int(odv.replace('d','')))
                        flg = 'div'
                    if 'm' in odv:
                        fdiv = str(int(fdiv) * int(odv.replace('m',''))) 
                        flg = 'mul' 
                #print('cal_genclk_div_freqfdiv:',cfreq,f2,fdiv)   
                #print('cal_genclk_div_freqfeq:',genclk,feq)              
                if flg == 'div':
                    fdivg += fdiv + ' '                   
                    ffreq += str(round(float(feq) / int(fdiv),2)) + ' ' 
                if flg == 'mul':
                    fdivg += '1/' + fdiv + ' '
                    ffreq += str(round(float(feq) * int(fdiv),2)) + ' '
                #print(fdivg,ffreq)

            gdiv = [x for x in fdivg.strip().split(' ')]  
            for tfq in ffreq.strip().split(' '):
                if '.0' in tfq:
                    tfq = tfq.replace('.0','M')
                elif '.00' in tfq:
                    tfq = tfq.replace('.00','M')
                else:
                    tfq = tfq.replace('.','M')
                gfreq.append(f'CYCLE{tfq}')   

        #print(gdiv,gfreq)
        return gfreq, gdiv

#################################################################
    # clkintg: all clk vars & definition
    #   -CRGIN/IPIN/HDIN    ----> blkvar
    #   -CRGOUT             ---> updt
    #   -IPOUT              ---> subblk
    #   -HDOUT              ----> updt or subblk(nocrg)
    # outclktype from crg: only mstclk/srcpin/grpnm
    #   -CRGIN/HDIN/IPIN    -----> updt
    # outclktype from ip: only mstclk/srcpin/grpnm
    #   -CRGIN/HDIN/IPIN    -----> subblk    
#################################################################
    def set_mstsrcgrp_from_outclktype(self,mode='CRGOUT'):
        # 'MCUJPEG_JPEG(val)_JPEG(var)':{'JPEG(var) HDIN clk_jpeg JPEG(val)_clk_jpeg_ast': []}
        curhd_pclksinfo = {}
        curhd_pclks = {}
        #print('_curhd_portclksinfo',self._curhd_portclksinfo)
        #{'MCUJPEG_JPEG_JPEG': {'JPEG HDIN clk_cr8 JPEG_clk_cr8_spg': []}}
        if self._curhd_portclksinfo:
            for ky,vl in self._curhd_portclksinfo.items():
                sval = ky.split('_')[1]
                svar = ky.split('_')[2]
                cinfo = {}
                for k,v in vl.items():
                    kw = k.split(' ')
                    cinfo[f'{sval}_{svar} {kw[1]} {kw[2]} {kw[3]}'] = v
                curhd_pclksinfo.update(cinfo)   

            for cky,val in curhd_pclksinfo.items():
                kwd = cky.split(' ')
                kvar = kwd[0].split('_')[1]
                kval = kwd[0].split('_')[0]
                ckyg = f'{kval}_{kwd[1]} {kwd[2]}'
                curhd_pclks[ckyg] = [kvar,kwd[3],val]

            curhd_outinfo = {k:v for k,v in curhd_pclks.items() if 'HDOUT' in k.split(' ')[0]}
            curhd_ininfo = {k:v for k,v in curhd_pclks.items() if 'HDIN' in k.split(' ')[0]}

        curcrg_pclks = {}
        curip_pclks = {}
        # 'MCUJPEG_MCUCRG1(val)_MCRG(var)': {'CRGIN_clk_mcu': []}
        # crgipdata = {}
        # if self._iptcrgdata:
        #     crgipdata.update(self._iptcrgdata)
        # if self._iptipdata:
        #     crgipdata.update(self._iptipdata)        
        
        #{'MCUJPEG_MCUCRG1_MCRG': {'CRGIN_clk_npu': ['MCUCRG1_NAME_clk_npu_gen', 'MCUCRG1_HIER_clk_npu_gen', 'MCUCRG1_NAME_clk_npu_gen', 'None', 'None', 'MCUCRG1'], 'CRGIN_clk_gpu': []}
        # 'MCUCRG1_CRGIN clk_mcu': []
        curcrg_outinfo = {}
        curcrg_ininfo = {}
        if self._iptcrgdata:
            ## als: 'MCUJPEG_MCUCRG1(val)_MCRG(var)'
            for cals,cvat in self._iptcrgdata.items():
                cval = cals.split('_')[1]
                cvar = cals.split('_')[2]
                for ky,vl in cvat.items():
                    # need support multi crg/ip(MIM) in same hd using als value at future??
                    # current using alias for single crg/ip                   
                    kw = ky.split('_')[0]
                    npt = '_'.join(ky.split('_')[1:])
                    cals = f'{cval}_{kw} {npt}'
                    curcrg_pclks[cals] = [cvar,vl[0],vl]
            curcrg_outinfo = {k:v for k,v in curcrg_pclks.items() if 'CRGOUT' in k.split(' ')[0]}
            curcrg_ininfo = {k:v for k,v in curcrg_pclks.items() if 'CRGIN' in k.split(' ')[0]}

        curip_outinfo = {}
        curip_ininfo = {}
        if self._iptipdata:
            ## als: 'MCUJPEG_MCUCRG1(val)_MCRG(var)'
            for cals,cvat in self._iptipdata.items():
                cval = cals.split('_')[1]
                cvar = cals.split('_')[2]
                for ky,vl in cvat.items():
                    # need support multi crg/ip(MIM) in same hd using als value at future??
                    # current using alias for single crg/ip                   
                    kw = ky.split('_')[0]
                    npt = '_'.join(ky.split('_')[1:])
                    cals = f'{cval}_{kw} {npt}'
                    curip_pclks[cals] = [cvar,vl[0],vl]
               
            curip_outinfo = {k:v for k,v in curip_pclks.items() if 'IPOUT' in k.split(' ')[0]}
            curip_ininfo = {k:v for k,v in curip_pclks.items() if 'IPIN' in k.split(' ')[0]}

        # print('curcrg_ininfo:',curcrg_ininfo)
        # print('curip_ininfo:',curip_ininfo)
        # print('curhd_ininfo:',curhd_ininfo)

        #  cover multi crg/ip 
        varg = ''
        # crg -> crg/ip/hd
        if mode == 'CRGOUT' and curcrg_outinfo:
            for ckw,cvt in curcrg_outinfo.items():
                ctype = cvt[2][3].replace('IO','').replace('GEN','').replace('(','').replace(')','')
                if ctype:
                    varg += self.set_crgip_outvars(curcrg_ininfo,ctype,cvt,kw='CRGIN')
                    varg += self.set_crgip_outvars(curip_ininfo,ctype,cvt,kw='IPIN')
                    varg += self.set_crgip_outvars(curhd_ininfo,ctype,cvt,kw='HDIN')

        # ip -> crg/ip/hd
        if mode == 'IPOUT' and curip_outinfo:
            for ckw,cvt in curip_outinfo.items():
                ctype = cvt[2][3].replace('IO','').replace('GEN','').replace('(','').replace(')','')
                if ctype:
                    varg += self.set_crgip_outvars(curcrg_ininfo,ctype,cvt,kw='CRGIN')
                    varg += self.set_crgip_outvars(curip_ininfo,ctype,cvt,kw='IPIN')
                    varg += self.set_crgip_outvars(curhd_ininfo,ctype,cvt,kw='HDIN')

        #print('set_crgip_outvarsvar:',varg)
        return varg
    

    # kw: CRGIN|IPIN|HDIN
    def set_crgip_outvars(self,curdata,ctype,cvt,kw='HDIN'):
        varg = ''
        for nkw,nvt in curdata.items():            
            if nkw.replace(' ','') in ctype:
                mclk = f'SDCVAR(NAME,${{{nvt[0]}}},{nvt[1]})'
                spin = f'SDCVAR(HIER,${{{nvt[0]}}},{nvt[1]})'
                cgrp = f'SDCVAR(GRPNM,${{{nvt[0]}}},{nvt[1]})'
                if kw == 'CRGIN' or kw == 'IPIN':
                    varg += f'''
set {mclk}    "$SDCVAR(NAME,${{{cvt[0]}}},{cvt[1]})"
set {spin}    "$SDCVAR(HIER,${{{cvt[0]}}},{cvt[1]})"
set {cgrp}    "$SDCVAR(GRPNM,${{{cvt[0]}}},{cvt[2][2]})"
'''                      
                if kw == 'HDIN':               
                    varg += f'''
set {mclk}    "$SDCVAR(NAME,${{{cvt[0]}}},{cvt[1]})"
set {spin}    "$SDCVAR(HIER,${{{cvt[0]}}},{cvt[1]})"
set {cgrp}    "$SDCVAR(GRPNM,${{{cvt[0]}}},{cvt[2][0]})"
'''            
        
        return varg
    
#################################################################
    # clkintg: all clk vars & definition
    #   -CRGIN/IPIN/HDIN    ----> blkvar
    #   -CRGOUT             ---> updt
    #   -IPOUT              ---> subblk
    #   -HDOUT              ----> updt or subblk(nocrg)
    # outclktype from crg: only mstclk/srcpin/grpnm
    #   -CRGIN/HDIN/IPIN    -----> updt
    # outclktype from ip: only mstclk/srcpin/grpnm
    #   -CRGIN/HDIN/IPIN    -----> subblk    
#################################################################
    def set_mstsrcgrp_from_clkintg(self,alias,clkintg,mode='IN'):
        # IN can be multi loading, but OUT is only one driver 
        # crt/gen nodvfs(dvfs)  IN(in clkdef/crg/ip)    clkdef to crg/ip(blkvar)   crg to crg/ip(updt)  ip to crg/ip(subblk)
        # gen nodvfs(dvfs)      OUT(in clkdef)          crg to clkdef(updt)        ip to clkdef(subblk)
        varg = ''
        inmode_info = []
        outmode_info = []
        vargout = []

        # in clkdef to crg/ip and hd
        nclkintg = []
        incinfo = []
        outcinfo = []

        # 'MCUJPEG_JPEG(val)_JPEG(var)':{'JPEG(val)_JPEG(var) HDIN clk_jpeg clk_jpeg_ast': []}
        curhd_pclksinfo = {}
        curhd_pclks = {}
        if self._curhd_portclksinfo:
            for ky,vl in self._curhd_portclksinfo.items():
                sval = ky.split('_')[1]
                svar = ky.split('_')[2]
                cinfo = {}
                for k,v in vl.items():
                    ky = k.split(' ')
                    cinfo[f'{sval}_{svar} {ky[1]} {ky[2]} {ky[3]}'] = v
                curhd_pclksinfo.update(cinfo)   

            for cky in curhd_pclksinfo.keys():
                val = curhd_pclksinfo[cky]
                kwd = cky.split(' ')
                kvar = kwd[0].split('_')[1]
                kval = kwd[0].split('_')[0]
                ckyg = f'{kval}_{kwd[1]} {kwd[2]}'
                # cknm = '_'.join(kwd[3].split('_')[1:])
                # kwd3 = f'{kval}_{cknm}'
                curhd_pclks[ckyg] = [kvar,kwd[3],val]

        #print('curhd_pclks',curhd_pclks,curhd_pclksinfo)
        #  cover multi crg/ip 
        if re.search(r'&',clkintg):
            nclkintg = [x.strip() for x in clkintg.strip().split('&')]
        else:
            nclkintg = [clkintg.strip()]
        #print('nclkintg',nclkintg)
        if 'IN' in mode:
            for scintg in nclkintg:
                if re.search(r'CRGIN',scintg):
                    incinfo = self.get_crgipdata_inmode(alias,scintg,'CRGIN',self._iptcrgdata)
                    inmode_info.append(incinfo)
                    # ninc = ['_'.join(x.split('_')[1:]) for x in incinfo if '_' in x]
                    # varg = f'{incinfo[-1]}_{ninc[0]} {incinfo[-1]}_{ninc[1]} {incinfo[-1]}_{ninc[2]}'                  
                    varg = f'{incinfo[0]} {incinfo[1]} {incinfo[2]} {incinfo[-1]}'
                    vargout.append(varg)

                if re.search(r'IPIN',scintg):
                    incinfo = self.get_crgipdata_inmode(alias,scintg,'IPIN',self._iptipdata)
                    inmode_info.append(incinfo)
                    # ninc = ['_'.join(x.split('_')[1:]) for x in incinfo if '_' in x]
                    # varg = f'{incinfo[-1]}_{ninc[0]} {incinfo[-1]}_{ninc[1]} {incinfo[-1]}_{ninc[2]}'
                    varg = f'{incinfo[0]} {incinfo[1]} {incinfo[2]} {incinfo[-1]}'
                    vargout.append(varg)

                if re.search(r'HDIN',scintg):
                    # incinfo = self.get_crgipdata_inmode(alias,scintg,'HDIN',self._iptipdata)
                    # inmode_info.append(incinfo)
                    if scintg in list(curhd_pclks.keys()):
                        pclkinfo = curhd_pclks[scintg]
                        mclk = f'SDCVAR(NAME,${{{pclkinfo[0]}}},{pclkinfo[1]})'
                        spin = f'SDCVAR(HIER,${{{pclkinfo[0]}}},{pclkinfo[1]})'
                        cgrp = f'SDCVAR(GRPNM,${{{pclkinfo[0]}}},{pclkinfo[2][0]})'
                        incinfo = [mclk,spin,cgrp]
                        vargout.append(f'{mclk} {spin} {cgrp}')
                    
                # if incinfo:
                #     varg = f'{incinfo[0]} {incinfo[1]} {incinfo[2]}'
                #     vargout.append(varg)
                # else:
                if not incinfo:
                    sdc_error(f'{scintg} from clkdef can not parse mclk/spin/grpnm.')

        # in clkdef from crg/ip
        if 'OUT' in mode:
            for scintg in nclkintg:
                if re.search(r'CRGOUT',scintg):
                    outcinfo = self.get_crgipdata_outmode(alias,scintg,'CRGOUT',self._iptcrgdata)
                    outmode_info.append(outcinfo)
                    # ninc = ['_'.join(x.split('_')[1:]) for x in outcinfo if '_' in x]
                    # varg = f'{outcinfo[-1]}_{ninc[0]} {outcinfo[-1]}_{ninc[1]} {outcinfo[-1]}_{ninc[2]}'
                    varg = f'{outcinfo[0]} {outcinfo[1]} {outcinfo[2]} {outcinfo[-1]}'
                    vargout.append(varg)

                # put into subblk
                if re.search(r'IPOUT',scintg):
                    outcinfo = self.get_crgipdata_outmode(alias,scintg,'IPOUT',self._iptipdata)
                    outmode_info.append(outcinfo)
                    # ninc = ['_'.join(x.split('_')[1:]) for x in outcinfo if '_' in x]
                    # varg = f'{outcinfo[-1]}_{ninc[0]} {outcinfo[-1]}_{ninc[1]} {outcinfo[-1]}_{ninc[2]}'
                    varg = f'{outcinfo[0]} {outcinfo[1]} {outcinfo[2]} {outcinfo[-1]}'
                    vargout.append(varg)

                # put into updt or subblk(no crg)
                if re.search(r'HDOUT',scintg):
                    # outcinfo = self.get_crgipdata_outmode(alias,scintg,'HDIN',self._iptipdata)
                    # outmode_info.append(outcinfo)
                    if scintg in list(curhd_pclks.keys()):
                        pclkinfo = curhd_pclks[scintg]
                        mclk = f'SDCVAR(NAME,${{{pclkinfo[0]}}},{pclkinfo[1]})'
                        spin = f'SDCVAR(HIER,${{{pclkinfo[0]}}},{pclkinfo[1]})'
                        cgrp = f'SDCVAR(GRPNM,${{{pclkinfo[0]}}},{pclkinfo[2][0]})'
                        outcinfo = [mclk,spin,cgrp]
                        #varg = f'{outcinfo[0]} {outcinfo[1]} {outcinfo[2]}'
                        vargout.append(f'{mclk} {spin} {cgrp}') 

                # if outcinfo:
                #     # varg = f'{outcinfo[0]} {outcinfo[1]} {outcinfo[2]}'
                #     # vargout.append(varg) 
                # else:
                if not outcinfo:
                    sdc_error(f'{scintg} from clkdef can not parse mclk/spin/grpnm.')           

        #print('set_mstsrcgrp_from_clkintg:',vargout)
        return vargout

    def get_crgipdata_inmode(self,alias,clkintg,kw,crgipdata):
        incinfo = []
        gval = clkintg.split(' ')[0].replace(f'_{kw}','')
        gvar = self.get_als_var(self._mdname,gval)
        nals = f'{alias}_{gval}_{gvar}'

        #print('get_crgipdata_inmode:',crgipdata)

        for key in list(crgipdata.keys()):
            if nals in key:
                ncrgiph = crgipdata[key]
                clkport = clkintg.split(' ')[1]
                if ncrgiph[f'{kw}_{clkport}']:
                    ncrgiph[f'{kw}_{clkport}'].append(gval)
                    incinfo = ncrgiph[f'{kw}_{clkport}']
                else:
                    sdc_error(f'Can not find {kw}_{clkport} in the header of {gval}.')
            # else:
            #     sdc_error(f'Can not find {nals} for header file.')
        
        return incinfo

    def get_crgipdata_outmode(self,alias,clkintg,kw,crgipdata):
        outinfo = []
        gval = clkintg.split(' ')[0].replace(f'_{kw}','')
        gvar = self.get_als_var(self._mdname,gval)
        nals = f'{alias}_{gval}_{gvar}'
        #print('get_crgipdata_outmode',crgipdata.keys(),list(crgipdata.keys()))
        for key in list(crgipdata.keys()):
            if nals in key:
                ncrgiph = crgipdata[key]
                clkport = clkintg.split(' ')[1]
                if ncrgiph[f'{kw}_{clkport}']:
                    outclktype = ncrgiph[f'{kw}_{clkport}'][3]
                    if 'GEN' in outclktype:
                        ncrgiph[f'{kw}_{clkport}'].append(gval)
                        outinfo = ncrgiph[f'{kw}_{clkport}']
                    else:
                        sdc_error(f'Missing GEN setting of outclktype for {gval}.')
                else:
                    sdc_error(f'Can not find {kw}_{clkport} in the header of {gval}.')
            # else:
            #     sdc_error(f'Can not find {nals} for header file.')

        return outinfo


#{'IPRow11': {'IntgType': 'IPOUT', 'ClkPort': 'clk_npu_out', 'MstClkNm': 'NAME_clk_npu_out', 'SrcPinNm': 'HIER_clk_npu_out', 'ClkGrpNm': 'NAME_clk_npu_out', 'OutClkType': 'IO|GEN|HDIN|IPIN|IPIN', 'ClkPeriod': '400M|300M'}, 'IPRow12': {'IntgType': 'IPOUT', 'ClkPort': 'clk_npu_out', 'MstClkNm': 'NAME_clk_npu_out', 'SrcPinNm': 'HIER_clk_npu_out', 'ClkGrpNm': 'NAME_clk_npu_out', 'OutClkType': 'IO|GEN|HDIN|IPIN|IPIN', 'ClkPeriod': '400M|300M'}}
#{'IPIN_clk_jsp': ['NAME_clk_jsp_gen', 'HIER_clk_jsp_gen', 'NAME_clk_jsp_gen', 'None', 'None'], 'IPOUT_clk_npu_out': ['NAME_clk_npu_out', 'HIER_clk_npu_out', 'NAME_clk_npu_out', 'IO|GEN|HDIN|IPIN|IPIN', '400M|300M']}
#['IPIN_clk_jsp', 'IPOUT_clk_npu_out']
# MCUJPEG_MCUCRG10_MCRG_CRG_CRG_Row13
# ftype: 'MCUJPEG_MCUCRG10_MCRG_CRG_CRG'
    def get_crgip_header(self,crgipfile,ftype):
        crgiplines = self.read_contxt(crgipfile,ftype)
        fkw = ftype.split('_')[-1]
        cials = ftype.split('_')[1]
        header_key = ['IntgType','ClkPort','MstClkNm','SrcPinNm','ClkGrpNm','OutClkType','ClkPeriod']
        #header_key = ['IntgType','ClkPort','ClkNm','ClkGrpNm','OutClkType']

        crgip_header = {}
        ncrgip_header = {}
        #hdict = {}
        crgip_hlst = []
        crgip_als = ''
        if crgiplines:
            for ky,vl in crgiplines.items():
                if re.search(rf'##\s+Start {fkw} Header for Clock Integration',vl):
                    st_line = ky.split('Row')[1]
                if re.search(r'#\s+IntgType',vl):
                    key_line = ky.split('Row')[1]
                if re.search(rf'##\s+End {fkw} Header for Clock Integration',vl):
                    ed_line = ky.split('Row')[1]
                    break
            for i in range(int(key_line),int(ed_line)):
                hdict = {}
                sline = crgiplines[f'{ftype}_Row{i}'].strip('#+')         
                if re.search(r'CRGIN|CRGOUT|IPIN|IPOUT',sline):
                    tline = re.findall(r'(\S*)\s*\t*(\S*)\s*\t*(\S*)\s*\t*(\S*)\s*\t*(\S*)\s*\t*(\S*)\s*\t*(\S*)\s*\t*',sline.strip(' +'))
                    #print(tline)
                    #tline = [('CRGOUT', 'clk_jpg_out', 'NAME_clk_jpg_out', 'HIER_clk_jpg_out', 'NAME_clk_jpg_out', 'IO|GEN|HDIN|IPIN|CRGIN', '800M|500M|260M'), ('', '', '', '', '', '', '')]
                    line = [x for x in tline[0]]
                    if len(line) < len(header_key):
                        diff = len(header_key) - len(line)
                        if diff > 3:
                            sdc_warn(f'{ftype} header file is not ready. Please check it.')
                    if re.search(r'\d+M',line[5]) and line[6] == '':
                        line[6] = line[5]
                        line[5] = 'None'
                    if line[5] == '' and line[6] == '':
                        line[5] = 'None'
                        line[6] = 'None'    
                    if re.search(r'IO|GEN|HDIN|IPIN|CRGIN',line[5]) and line[6] == '':
                        line[6] = 'None'

                    if len(line) == len(header_key):
                        for k,v in zip(header_key,line):
                            xv = v.strip(' +')
                            if re.search(r'MstClkNm|SrcPinNm|ClkGrpNm',k):
                                # NAME_${MCUCRG}_xxx, modify ${MCUCRG} to MCUCRG10 from hier yaml
                                #vl = f'{cials}_{xv}'
                                vg = xv.split('_')
                                ck = '_'.join(vg[2:])
                                vl = f'{vg[0]}_{cials}_{ck}'
                                vr = vg[1].replace('$','').replace('{','').replace('}','')
                                #vl = xv.replace('$','').replace('{','').replace('}','')
                            else:
                                vl = xv
                            hdict[k] = vl
                        hdict[f'{fkw}AVR'] = vr
                        #crgip_header[f'{ftype}_{vr}_Row{i}'] = hdict
                        crgip_header[f'{ftype}_Row{i}'] = hdict

                    nkey = hdict['IntgType'] + '_' + hdict['ClkPort']
                    nval = []
                    for key,val in hdict.items():
                        if 'IntgType' not in key and 'ClkPort' not in key and not f'{fkw}AVR' in key:
                            nval.append(hdict[key])
                    ncrgip_header[nkey] = nval
                    crgip_hlst.append(nkey)
                    crgip_als = vr

        return crgip_header,ncrgip_header,crgip_hlst,crgip_als

    def read_contxt(self,file,kw):
        if not os.path.exists(file):
            raise FileExistsError(f'{file} does not exists')
            # sdc_error(f'{file} not exist. Please check it.')
            # exit(1)
        else:
            txt_list = {}
            i = 0
            with open(file,'r') as fh:
                for line in fh.readlines():                    
                    if line.strip() == "":
                        continue
                    i += 1
                    #txt_list.append(line.strip())
                    txt_list[f'{kw}_Row{i}'] = line.strip()
        
            return txt_list    

# clk period from crg/ip
    def set_clkperd_from_crgip(self,name):
        crgip_cyclines = ''
        # prm = pwr.split(' ')[0].strip()
        # vlg = pwr.split(' ')[1:]

        alslst = []
        nclknm = []
        nclkperd = []
        #xclknm = []
        #xclkperd = []
        #[{als:[],als:[]},{als:[]}]
        clknm = self.get_clkinfo_from_crgip('0','M')
        clkperd = self.get_clkinfo_from_crgip('4','M')
        #print('start dfeghhy')
        #print(clknm,clkperd)
        for x in clknm:
            for k,v in x.items():
                alslst.append(k)
                nclknm.append(v)
        for x in clkperd:
            for k,v in x.items():
                #alslst.append(k)
                nclkperd.append(v)

        #print(alslst,nclknm,nclkperd)
        #xclknm = [i for g in nclknm for i in g]
        #xclkperd = [i for g in nclkperd for i in g]
        # nvar = [x.values() for x in clkperd]
        # xvar = [list(vl) for vl in nvar]
        # nclkperd = [i for g in xvar for i in g]

        xprm = []
        xvlg = []
        xalias = []
        for x in alslst:
            cials = x.split(' ')[0].split('_')[1]
            blk = self._hiertree.get_name_by_alias(name,cials)
            sblk = self._hiertree.get_block_by_name(blk)
            xalias.append(sblk.alias)
            dcdc = self._hiertree.get_dcdc_varval_by_name(name,blk)
            xprm.append(list(dcdc.keys())[0])
            
            if len(list(dcdc.values())) > 1:
                sdc_warn(f'{blk} has more than DCDC values.')
            else:
                #print('dcdc+++++++++++:',dcdc,xprm)
                tvl = self._hiertree._pwrdata[''.join(list(dcdc.values())[0][0])].strip()               
                if ' ' in tvl:
                    xvlg.append(tvl.split(' '))
                else:
                    xvlg = xvlg.split()
                #print('xvlg+++++++++++++:',tvl,xvlg)

        # sdata = {}
        # mdata = {}
        # for clk,cyc in zip(xclknm,xclkperd):
        #     if clk and cyc:
        #         if '|' in cyc:
        #             #num = len(cyc.split('|'))
        #             # if num != len(vlg):
        #             #     sdc_error(f'the period number of {clk} from crg/ip is not correct.')
        #             mdata[clk] = [f'$SDCVAR({x})' for x in cyc.split('|')]
        #         else:
        #             sdata[clk] = f'$SDCVAR({cyc})'

        #print('iieiieieeieie')

        crgip_cyclines += f'''
############################################################
## Clock Period Definition from CRG/IP             
############################################################
''' 
        
        #print(xalias,xprm,xvlg,nclknm,nclkperd)
        for als,prm,vlg,clks,cycs in zip(xalias,xprm,xvlg,nclknm,nclkperd):
            if len(vlg) == 1:
                for ck,cy in zip(clks,cycs):
                    xcy = f'$SDCVAR(CYCLE{cy})'
                    crgip_cyclines += f'''
set SDCVAR(CYCLE,${{{als}}},{ck}) "{xcy}"
'''
                    crgip_cyclines=crgip_cyclines.rstrip()
            if len(vlg) > 1:
                for inm,vlt in enumerate(vlg):           
                    crgip_cyclines += f'''
if {{$SDCVAR(DCDC_VL,${{{prm}}}) == "{vlt}"}} {{
'''                  
                    crgip_cyclines=crgip_cyclines.rstrip()
                    for ck,cy in zip(clks,cycs):
                        if '|' in cy:
                            if len(vlg) != len(cy.split('|')):
                                sdc_error(f'the period number of {ck} from crg/ip is not correct.')
                            xcy = cy.split('|')[inm]
                            #print('inm:',inm,'vlt:',vlt,'ck',ck,'cy',cy,'vlg:',vlg)
                            xc = f'$SDCVAR(CYCLE{xcy})'
                            crgip_cyclines += f'''
    set SDCVAR(CYCLE,${{{als}}},{ck}) "{xc}"
''' 
                            crgip_cyclines=crgip_cyclines.rstrip()
                        else:
                            xc = f'$SDCVAR(CYCLE{cy})'
                            crgip_cyclines += f'''
    set SDCVAR(CYCLE,${{{als}}},{ck}) "{xc}"
'''
                            crgip_cyclines=crgip_cyclines.rstrip()

                    crgip_cyclines += f'''              
}}

'''     

        return crgip_cyclines

# group
    def get_clkgrp_from_clkdef(self):
        gpat = [val[0] for val in self._clknmdata.values()]
        npat = list(set(gpat))
        #print('get_clkgrp_from_clkdef++++++++++++++++++++:',self._clknmlst)

        clkgrp = {}
        for grp in npat:
            grplst = []
            for clknm in self._clknmlst:
                #print(grp,self._clknmdata[clknm])
                if grp == self._clknmdata[clknm][0]:
                    grplst.append(clknm)
            grpnm = grplst[0]
            clkgrp[grpnm] = grplst

        return clkgrp


    def get_clkgrp_from_clkdef_inmode(self):
        clknmlst = []
        clknmdata = {}
        for clknm in self._clknmlst:
            if not self.is_crgiphd_goutclk(clknm,'CRGOUT') and not self.is_crgiphd_goutclk(clknm,'IPOUT') and not self.is_crgiphd_goutclk(clknm,'HDOUT'):
                clknmlst.append(clknm)
                clknmdata[clknm] = self._clknmdata[clknm] 
        
        gpat = [val[0] for val in clknmdata.values()]
        npat = list(set(gpat))

        clkgrp = {}
        for grp in npat:
            grplst = []
            for clknm in clknmlst:
                #print(grp,clknmdata[clknm])
                if grp == clknmdata[clknm][0]:
                    grplst.append(clknm)
            grpnm = grplst[0]
            clkgrp[grpnm] = grplst

        return clkgrp
            
    def set_grpvar_from_clkdef(self,alias,fintg=False):
        valg = ''
        clkgrp = self.get_clkgrp_from_clkdef_inmode()

        valg += f'''
############################################################
## Clock Group Definition from Clkdef             
############################################################
'''        
        for grpnm,grplst in clkgrp.items():
            #ngrplst = [x.split(' ')[0] for x in grplst]
            rgrplst = ''
            tgrplst = ''
            for clknm in grplst:
                rgrplst += f'$SDCVAR(NAME,${{{alias}}},{clknm}) '
                if not self.is_inps_crtclk(self._clknmdata,clknm):
                    tgrplst += f'$SDCVAR(NAME,${{{alias}}},{clknm}) '
            rgrplst = rgrplst.strip()
            tgrplst = tgrplst.strip()
            if self.is_crtclk(grplst[0]) and not self.is_pllclk(grplst[0]):
                if not fintg:
                    valg += f'''
## Clock Group: {grpnm}
if {{!$SDCVAR({self._flt},${{{alias}}})}} {{
    set SDCVAR(GRPNM,${{{alias}}},{grpnm}) "$SDCVAR(NAME,${{{alias}}},{grpnm})"
    set SDCVAR(GRPLST,${{{alias}}},{grpnm}) "[list {rgrplst}]"
}} else {{
    set SDCVAR(GRPNM,${{{alias}}},{grpnm}) "$SDCVAR(NAME,${{{alias}}},{grpnm})"
    set SDCVAR(GRPLST,${{{alias}}},{grpnm}) "[list {tgrplst}]"
}}
'''
                else:
                    if len(grplst) > 1:
                        rgrplst = ' '.join(rgrplst.split(' ')[1:])
                        valg += f'''
## Clock Group: {grpnm}                        
set SDCVAR(GRPNM,${{{alias}}},{grpnm}) "$SDCVAR(NAME,${{{alias}}},{grpnm})"
set SDCVAR(GRPLST,${{{alias}}},{grpnm}) "[list {rgrplst}]"
'''                        
            else:
                valg += f'''
## Clock Group: {grpnm}              
set SDCVAR(GRPNM,${{{alias}}},{grpnm}) "$SDCVAR(NAME,${{{alias}}},{grpnm})"
set SDCVAR(GRPLST,${{{alias}}},{grpnm}) "[list {rgrplst}]"
'''
        return valg

# cycle
    def get_cycle_from_clkdef(self):
        freq_list = []       

        tclkdata,tclklst = self.concat_clkdef_crgiphd_gen_outclk()
        for clknm in self._clknmlst:           
            freq = self._clknmdata[clknm][1]
            #freq = tclkdata[clknm][1]
            if self.is_crtclk(clknm):
                if freq:
                    if '|' in freq:
                        crtdvfs_freq = [f'CYCLE{x}' for x in freq.split('|')]
                        freq_list += crtdvfs_freq
                    else:
                        freq_list.append(f'CYCLE{freq}')
                else:
                    sdc_error(f'Missing freq value for created clock {clknm}.')
            
            if self.is_genclk(clknm):
                if freq:
                    if '|' in freq:
                        crtdvfs_freq = [f'CYCLE{x}' for x in freq.split('|')]
                        freq_list += crtdvfs_freq
                    else:
                        freq_list.append(f'CYCLE{freq}')
                else:
                    #if not self.is_oups_genclk(clknm) and not self.is_crgiphd_toutclk(clknm) and self._clknmdata[clknm][4] in self._clknmlst:
                    #if self._clknmdata[clknm][4] in self._clknmlst:
                    if self._clknmdata[clknm][4] in tclklst:
                        # print('cal_genclk_div_freq:tclklst',tclklst)
                        # print('cal_genclk_div_freq:',self._curhd_portclks)
                        # print('cal_genclk_div_freq:',clknm)
                        hfreq,hdiv = self.cal_genclk_div_freq(clknm)                  
                        freq_list += hfreq
        for cyc in freq_list:
            if cyc not in self._cycle_clkdeflst:
                self._cycle_clkdeflst.append(cyc)
        
              
    def get_cycle_from_crgip(self):
        crgcyclst = []
        crglst = []

        crgip_lst = {}
        crgip_lst.update(self._iptcrglst)
        crgip_lst.update(self._iptiplst)
        crgip_data = {}
        crgip_data.update(self._iptcrgdata)
        crgip_data.update(self._iptipdata)

        for ncrg in crgip_lst.keys():
            crghval = []
            crglst = []
            for ncrgport in crgip_lst[ncrg]:
                crghval.append(crgip_data[ncrg][ncrgport])
            for vl in crghval:
                if vl[4] != 'None':
                    if '|' in vl[4].strip():
                        ncyc = [f'CYCLE{x}' for x in vl[4].split('|')]
                        crglst.append(ncyc)
                    else:
                        crglst.append(f'CYCLE{vl[4].strip()}'.split()) 
            crglst = [x for sub in crglst for x in sub]
            crgcyclst.extend(crglst)

        # if self._ipflg:
        #     for nip in list(self._iptiplst.keys()):
        #         for nipport in self._iptiplst[nip]:
        #             iphval.append(self._iptipdata[nip][nipport])
        #         for vl in iphval:
        #             if vl[4] != 'None':
        #                 if '|' in vl[4].strip():
        #                     ncyc = [f'CYCLE{x}' for x in vl[4].split('|')]
        #                     iplst.append(ncyc)
        #                 else:
        #                     iplst.append(f'CYCLE{vl[4].strip()}'.split()) 
        #     iplst = [x for sub in iplst for x in sub]
            #print(iplst) 
        
               
        self._cycle_crgiplst = crgcyclst

# 
    def get_clkinfo_from_crgip(self,idx,kw=''):
        crgclkinfolst = [] 
        ipclkinfolst = []    
        clkinfolst = []
        crghval = {}
        iphval = {}
        idxg = int(idx)
        
        crgalsiptval = {}
        crgalsiptval.update(self._crgalsiptval)
        crgalsiptval.update(self._ipalsiptval)
        #[{'als':[]},{'als':[]}]
        for key,val in crgalsiptval.items():
            crgclkinfolst = []
            for vl in val:
                # for OutClkType: IO/GEN/...
                if vl[idxg] and f'{kw}' in vl[3]:
                    crgclkinfolst.append(vl[idxg].strip())
                # for ClkPerd: M 
                if vl[idxg] and f'{kw}' in vl[4]:
                    crgclkinfolst.append(vl[idxg].strip())
                # for MstClkNm/SrcPinNm/ClkGrpNm:
                # else:
                #     # maybe 'None'
                #     crgclkinfolst.append(vl[idxg].strip())
            crghval[key] = crgclkinfolst
        clkinfolst.append(crghval)
            #print(clkinfolst)

        # if self._ipflg:
        #     for key,val in self._ipalsiptval.items():
        #         for vl in val:
        #             # for OutClkType: IO/GEN/...
        #             if vl[idxg] and f'{kw}' in vl[3]:
        #                 ipclkinfolst.append(vl[idxg].strip())
        #             # for ClkPerd: CYCLE 
        #             if vl[idxg] and f'{kw}' in vl[4]:
        #                 ipclkinfolst.append(vl[idxg].strip())
        #             # for MstClkNm/SrcPinNm/ClkGrpNm:
        #             # else:
        #             #     ipclkinfolst.append(vl[idxg].strip())
        #         iphval[key] = ipclkinfolst
        #     clkinfolst.append(iphval)
        
        return clkinfolst

    def get_intgport_from_crgip(self):
        crgclkinfolst = [] 
        #ipclkinfolst = []   
        intgportlst = []
        crgiplst = {}
        crgiplst.update(self._iptcrglst)
        crgiplst.update(self._iptiplst)

        for ky,vl in crgiplst.items():
            for v in vl:
                nval = ky.split('_')[-1] + '_' + v.split('_')[0] + ' ' + '_'.join(v.split('_')[1:])
                crgclkinfolst.append(nval)
        intgportlst = crgclkinfolst

        # if self._ipflg:
        #     for ky,vl in self._iptiplst.items():
        #         for v in vl:
        #             nval = ky.split('_')[-1] + '_' + v.split('_')[0] + ' ' + '_'.join(v.split('_')[1:])
        #             ipclkinfolst.append(nval)              
        #     intgportlst += ipclkinfolst
        #print(intgportlst)

        return intgportlst



    # figure out the relationship of father and children for generated clock
    def get_genclk_loc(self,genclk):
        pass

    # trace all of clks to figure out group list and group name by topdown
    # MIM w/o genclk
    def set_clkgrp(self,mdname,alias):
        clkgrp_lines = ''

        curblk = self._hiertree.get_block_by_name(mdname)
        #curhdblks = curblk.get_curhd_by_name()
        curhdblks = self._hiertree.get_hierlvlblks(mdname,outtype='hd')
        curhdblksg = [x for x in curhdblks if not x in mdname]
        curhd_hierals_var = []
        subhd_cond = []      
        for hbk in curhdblksg:
            blk = self._hiertree.get_block_by_name(hbk)
            curhd_hierals_var.append(f'{blk.alias} {blk.lvl_flat}')
        if curhdblksg:
            clkgrp_lines = f'''
if {{!$SDCVAR({self._flt},${{{alias}}}) && !$SDCVAR(LIB,${{{alias}}})}} {{
## sys/blk flatten
'''
            for aft in curhd_hierals_var:
                als = aft.split(' ')[0]
                flt = aft.split(' ')[1]
                subhd_cond.append(f'$SDCVAR({flt},${{{als}}}) && !$SDCVAR(LIB,${{{als}}}) && ')
            subhd_condg = ''.join(subhd_cond).rstrip(' && ')
            clkgrp_lines += f'''
    if {{{subhd_condg}}} {{
'''

            clkgrp_lines += self.set_clkgrp_for_blkflat(mdname,alias)
            clkgrp_lines += f'''

    }} else {{
    ## sys/blk only
'''
            clkgrp_lines += self.set_clkgrp_for_blkonly_tmp(mdname,alias)
            clkgrp_lines += f'''
    }}
}}
'''

        else:
            clkgrp_lines = f'''
if {{!$SDCVAR({self._flt},${{{alias}}}) && !$SDCVAR(LIB,${{{alias}}})}} {{
# blk only
'''
            clkgrp_lines += self.set_clkgrp_for_blkonly_tmp(mdname,alias)
            clkgrp_lines += f'''
}}
'''

        ## phy_grp/loc_grp
        # do not consider clks from CRG/IP, only from clkdef
        clkgrp_lines += self.set_phylog_clkgrp(mdname,alias,self._clknmlst,self._clknmdata,'PHY','physically')
        clkgrp_lines += self.set_phylog_clkgrp(mdname,alias,self._clknmlst,self._clknmdata,'LOG','logically')

        return clkgrp_lines
    
    def set_clkgrp_for_blkonly(self,mdname,alias):
        clkgrp_lines = ''
        # grpnm: grplst
        clkdefgrp = self.get_clkgrp_from_clkdef() 
        tclklst,tclkdata = self.concat_curhd_crgiphd_connect()
        #print('set_clkgrp_for_blkonly++++++++++++++++++++++++++:',tclkdata)
        fgenclk_lines = self.get_genclk_lines_by_name(tclklst,tclkdata,'','')

        # remove clks not belong to current level blk
        genclk_lines = {}
        # curblks = self._hiertree.get_curblks(mdname)
        # curals = []
        # for blk in curblks:
        #     nbk = self._hiertree.get_block_by_name(blk)
        #     curals.append(nbk.alias)
        # if curals:
        #     for gclk,gline in fgenclk_lines.items():
        #         ngline = [x for x in gline if x.split(' ')[0] in curals]
        #         for x in gline:
        #             if ' ' in x:
        #                 if x.split(' ')[0] in curals:
        #                     ngline.append(x)
        #             else:
        #                 ngline.append(x)

        #         if ngline:
        #             genclk_lines[gclk] = ngline
        # else:
        #     genclk_lines = fgenclk_lines
            
        for gclk,gline in fgenclk_lines.items():
            if not gclk in tclklst and 'HDIN' in tclkdata[gline[-2]][6]:
                if '&' in tclkdata[gline[-2]][6]:
                    continue
                else:
                    genclk_lines[gline[-2]] = gline[:-1]
            elif not gline[0] in tclklst and 'HDOUT' in tclkdata[gline[-1]][6]:
                genclk_lines[gline[-1]] = gline[1:]
            else:
                genclk_lines[gclk] = gline

        #print('set_clkgrp_for_blkonly:tclklst',tclklst)
        #print('set_clkgrp_for_blkonly###########################:fgenclk_lines',fgenclk_lines)
        #print('set_clkgrp_for_blkonly#++++++++++++++++++++++++++:genclk_lines',genclk_lines)
                
        for gknm,gvlst in clkdefgrp.items():
            #egrplst = gvlst
            egrplst = []
            egclklst = []
            inflg = False
            outflg = False
            #print('genclk_lines',gknm,genclk_lines)
            for gclk,gline in genclk_lines.items():
                if gknm in gline:
                    # multi_loading ??
                    # for CRGIN/IPIN
                    if not gclk in self._clknmlst and gknm == gline[0] and tclkdata[gclk][6]:                      
                        cals = tclkdata[gclk][6].split(' ')[0]
                        cals = cals.split('_')[0]
                        print('mdname:',mdname,'cals:',cals)
                        bals = self.get_als_var(mdname,cals)                   
                        # 'CRG MCUCRG1 NAME_clk_mcu_gen'
                        sval = f'{bals} {gclk}'
                        if not sval in egclklst:
                            egclklst.append(sval)
                        inflg = True
            
                    # for CRGOUT/IPOUT
                    if not gline[0] in self._clknmlst and gknm == gline[1] and tclkdata[gline[0]][6]:
                        cals = tclkdata[gline[0]][6].split(' ')[0]
                        cals = cals.split('_')[0]
                        print('mdname:',mdname,'cals:',cals)
                        bals = self.get_als_var(mdname,cals)
                        sval = f'{bals} {gline[0]}'
                        #print('CRGOUT/IPOU',sval)
                        # 'CRG MCUCRG1 NAME_clk_mcu_gen'
                        if not sval in egclklst:
                            egclklst.append(sval)
                        outflg = True
            #print('GRP inflg:',inflg,'outflg:',outflg,'egclklst:',egclklst)

            ngrplst = []
            if inflg:
                egrplst.extend(gvlst)
                egrplst.extend(egclklst)
                cigrp = []
                #print('inflg',egrplst,gvlst)
                for ngnm in egrplst:
                    if ngnm in gvlst:
                        ngrplst.append(f'$SDCVAR(NAME,${{{alias}}},{ngnm})')
                    else:
                        if ' ' in ngnm:
                            xals = ngnm.split(' ')[0]
                            xgnm = ' '.join(ngnm.split(' ')[1:])
                            grpnm = tclkdata[xgnm][0]
                            ngrplst.append(f'$CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{xals}}},{grpnm}))')
                            cigrp.append(f'CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{xals}}},{grpnm}))')
               
                egrplast = ' '.join(egrplst[-1].split(' ')[1:])
                #print('inflg',ngrplst,cigrp)
                #print('inflg egrplast',egrplast,self._tclklst)
                if egrplst[0] in self._clknmlst and egrplast in tclklst:
                    clkgrp_lines += f'''
    ## Clock Group: {egrplst[0]}               
    set CLOCK_GROUP_NAME($SDCVAR(NAME,${{{alias}}},{egrplst[0]})) [concat {' '.join(ngrplst)}]
'''
                    clkgrp_lines = clkgrp_lines.rstrip()
                    for cgrp in cigrp:
                        clkgrp_lines += f'''
    unset {cgrp} 
'''                    
#     if {{[info exists {cgrp}]}} {{
#         unset {cgrp}
#     }}
# '''
            elif outflg:
                #egclklst.extend(egrplst)
                egclklst.extend(gvlst)
                #cigrp = []
                for ngnm in egclklst:
                    if ngnm in gvlst:
                        ngrplst.append(f'$SDCVAR(NAME,${{{alias}}},{ngnm})')
                    else:
                        if ' ' in ngnm:
                            xals = ngnm.split(' ')[0]
                            xgnm = ' '.join(ngnm.split(' ')[1:])
                            grpnm = tclkdata[xgnm][0]
                            ngrplst.append(f'$CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{xals}}},{grpnm}))')
                            #cigrp.append(f'CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{xals}}},{grpnm}))')
                #print('outflg',ngrplst,egclklst[0])
                egals = egclklst[0].split(' ')[0]
                egclk = ' '.join(egclklst[0].split(' ')[1:])
                egclkg = egclklst[0].split(' ')[-1]
                if egclklst[-1] in self._clknmlst and egclk in tclklst:
                    clkgrp_lines += f'''
    ## Clock Group: {egclklst[0]}                 
    set CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{egals}}},{egclkg})) [concat {' '.join(ngrplst)}]
'''            
            else:
                for ngnm in gvlst:
                    ngrplst.append(f'$SDCVAR(NAME,${{{alias}}},{ngnm})')
                clkgrp_lines += f'''
    ## Clock Group: {gvlst[0]}                 
    set CLOCK_GROUP_NAME($SDCVAR(NAME,${{{alias}}},{gvlst[0]})) [concat {' '.join(ngrplst)}]
''' 

        #clkgrp_lines += f'''}}'''
        
        return clkgrp_lines
    
    def set_clkgrp_for_blkonly_tmp(self,mdname,alias):
        clkgrp_lines = ''
        curhd_inter_clkgrp_intg = {}

        # grpnm: grplst
        clkdefgrp = self.get_clkgrp_from_clkdef() 
        tclklst,tclkdata = self.concat_curhd_crgiphd_connect()
        #genclk_lines = self.get_genclk_lines_by_name(tclklst,tclkdata,'','')
        #print('set_clkgrp_for_blkonly_tmp:genclk_lines+++++++++++++:',genclk_lines)
        #print('set_clkgrp_for_blkonly_tmp:tclkdata####################:',tclkdata)

        exlu_clklst = []
        nclklst = []
        nclknmlst = []
        nclknmdata = {}
        #print('clkdefgrp:###########################:',clkdefgrp)
        for gpnm,gplst in clkdefgrp.items():
            if not self.is_inps_crtclk(tclkdata,gpnm) and not re.search(r'IN|OUT',str(tclkdata[gpnm][6])) and not self.is_oups_genclk(tclkdata,gplst[-1]):
                # if gpnm in self._clknmlst:
                curhd_inter_clkgrp_intg[f'{gpnm}'] = gplst
                # else:
                #     curhd_inter_clkgrp_intg[f'{alias} {gpnm}'] = gplst
                exlu_clklst.extend(gplst)
        #print('set_blkonly_tmp:inter_clkgrp_intg+++++++++++++++++++++:',curhd_inter_clkgrp_intg)
        if exlu_clklst:
            nclklst = [x for x in tclklst if not x in exlu_clklst]
        else:
            nclklst = tclklst
        for nval in nclklst:
            nclknmdata[nval] = tclkdata[nval]
            nclknmlst.append(nval)

        genclk_lines = self.get_genclk_lines_by_name(nclknmlst,nclknmdata,'','')

        curhd_hierals_var = []
        curblk = self._hiertree.get_block_by_name(mdname)
        hdblksg = curblk.get_curhd_by_name()
        if hdblksg:
            for hbk in hdblksg:
                blk = self._hiertree.get_block_by_name(hbk)
                curhd_hierals_var.append(blk.alias)

        #MCUJPEG MCUJPEG_clk_jsp_out_gen_out': ['JPEG JPEG_clk_jxxsp_out_gen_out', 'MCUJPEG MCUJPEG_clk_jsp_out_gen_out'
        #MCUJPEG MCUJPEG_clk_jsp_cr8_gen_out': ['CR8 CR8_NAME_clk_cr8_out', 'MCUJPEG MCUJPEG_clk_jsp_cr8_gen_out'
        #set CLOCK_GROUP_NAME($SDCVAR(GRPNM,${CAMCRG},CAMCRG1_NAME_clk_cam_jpg_out)) [concat $CLOCK_GROUP_NAME($SDCVAR(GRPNM,${CAMCRG},CAMCRG1_NAME_clk_cam_jpg_out))]
        ngenclk_lines = {}
        curals = []
        curblks = self._hiertree.get_curblks(mdname)
        for hbk in curblks:
            blk = self._hiertree.get_block_by_name(hbk)
            curals.append(blk.alias)
        #print('curhd_hierals_var+++++++++++++:',curhd_hierals_var)
        #print('curals++++++++++++++++++++++:',curals)
        for k,v in genclk_lines.items():
            nv = []
            nk = ''
            for x in v:
                if ' ' in x:
                    if x.split(' ')[0] in curals  and not x.split(' ')[0] in curhd_hierals_var:
                        nv.append(x)
                else:
                    nv.append(x)
            if ' ' in k:
                if k.split(' ')[0] in curals  and not k.split(' ')[0] in curhd_hierals_var:
                    if k == nv[0] and len(nv) == 1:
                        nk = ''
                    else:
                        nk = k
                else:
                    if nv:
                        nk = nv[-1]
                    else:
                        nk = ''
            else:
                nk = k
        
            if nk.split(' ')[0] in curals  and not nk.split(' ')[0] in curhd_hierals_var:
                if nk == nv[0] and len(nv) == 1:
                    nv = []
            if nk and nv:
                ngenclk_lines[nk] = nv
        
        #print('ngenclk_lines++++++++++++++++++:',ngenclk_lines)

        #clk_cam_out_gen_out': ['JPEG JPEG_clk_jxxsp_out_gen_out', 'MCUJPEG MCUJPEG_clk_jsp_out_gen_out', 'clk_cam_out_gen_out']
        clkgrp_lines += self.set_mld_clkgrp(alias,nclknmdata,curhd_hierals_var,ngenclk_lines,curhd_inter_clkgrp_intg,'')
        
        return clkgrp_lines
    
    def set_clkgrp_for_blkflat(self,mdname,alias):
        clkgrp_lines = ''
        # grpnm: grplst
        #clkdefgrp = self.get_clkgrp_from_clkdef()         
        curhd_hierclklst,curhd_hierclkdata,curhd_hier_inter_clkgrp,curhd_hier_phylog_clkgrp = self.get_hierclk_intg()
        #print('set_clkgrp_for_blkflat:curhd_hier_inter_clkgrp++++++++++++++++++++++++++++',curhd_hier_inter_clkgrp)
        # print('set_clkgrp_for_blkflat:curhd_hierclkdata',curhd_hierclkdata)
        # print('set_clkgrp_for_blkflat:curhd_hierclklst',curhd_hierclklst)
        genclk_lines = self.get_genclk_lines_intg(curhd_hierclklst,curhd_hierclkdata,'')

        # genclk_lines = {}
        # for gclk,gline in xgenclk_lines.items():
        #     if not gline[0] in curhd_hierclklst:
        #         genclk_lines[gclk] = gline[1:]
        #     else:
        #         genclk_lines[gclk] = gline
        # print('xgenclk_lines',xgenclk_lines)
        #print('genclk_lines',genclk_lines)
        # curhd_inter_clkgrp = {}
        # for gpnm,gplst in clkdefgrp:
        #     if not self.is_inps_crtclk(gpnm) and not re.search(r'IN|OUT',self._clknmdata[gpnm][6]):
        #         curhd_inter_clkgrp[f'{alias}_{gpnm}'] = gplst
        # curhd_hier_inter_clkgrp.update(curhd_inter_clkgrp)

        all_hierhd_pclk = {}
        all_hierinhd_pclk = {}
        all_hierouthd_pclk = {}
        curhd_hierals_var = [f'{alias}']
        hdblksg = self._hiertree.get_hierlvlblks(mdname,outtype='hd')
        #hdblks = [x for x in hdblksg if not x is mdname]
        for hbk in hdblksg:
            blk = self._hiertree.get_block_by_name(hbk)
            curhd_hierals_var.append(blk.alias)
            inhd_pclk,outhd_pclk = self.get_curhd_portclks(hbk)
            if inhd_pclk:
                all_hierinhd_pclk.update(inhd_pclk)
            if outhd_pclk:
                all_hierouthd_pclk.update(outhd_pclk)
        
        if all_hierinhd_pclk:
            all_hierhd_pclk.update(all_hierinhd_pclk)
        if all_hierouthd_pclk:
            all_hierhd_pclk.update(all_hierouthd_pclk)

        # need cover portclk with no genclks in loading
        # #ngenclk_lines = {k:v for k,v in genclk_lines if not k in all_hierhd_pclk.keys()}
        # pclk_with_nogen = [] # floating or no genclk in loading
        # pclk_with_gen = []
        # pclk_with_nogen_nomst = [] # undriven or tie
        # pclk_with_gen_nomst = [] # undriven or tie
        # pclk_with_fdth = []
        # for pky,pvl in all_hierinhd_pclk.items():
        #     # pnum_with_nogen = 0 # floating or no genclk in loading
        #     # pnum_with_gen = 0
        #     # pnum_with_nogen_nomst = 0 # undriven or tie
        #     # pnum_with_gen_nomst = 0 # undriven or tie
        #     # pnum_with_fdth = 0
        #     pnum = 0
        #     for gky,gvl in genclk_lines.items():
        #         if pky == gky and len(gvl) == 1:
        #             pnum += 1
        #         if pky in gvl and not pky == gvl[-1]:
        #             pnum += 1
        #     if pnum == 1:
        #         pclk_with_nogen.append(pky)
        #     if pnum >= 2:
        #         pclk_with_gen.append(pky)
            
        # remove hdin portclk with genclk
        #ngenclk_lines = {k:v for k,v in genclk_lines.items() if not v[-1] in all_hierinhd_pclk.keys()}
        #print('all_hierinhd_pclk+++++++++++++:',all_hierinhd_pclk)
        ngenclk_lines = {}
        for k,v in genclk_lines.items():
            nv = [x for x in v if not x in list(all_hierinhd_pclk.keys())]
            ngenclk_lines[k] = nv

        clkgrp_lines += self.set_mld_clkgrp(alias,curhd_hierclkdata,curhd_hierals_var,ngenclk_lines,curhd_hier_inter_clkgrp,curhd_hier_phylog_clkgrp)
        
        return clkgrp_lines


    def set_mld_clkgrp(self,alias,curhd_hierclkdata,curhd_hierals_var,ngenclk_lines,curhd_hier_inter_clkgrp,curhd_hier_phylog_clkgrp):
        clkgrp_lines = ''
        # 'MCUCRG1 NAME_clk_mcu':[[],[]]
        mld_genclk_lines = {}
        sld_genclk_lines = {}
        mld_gclks = list(set([x[0] for x in ngenclk_lines.values()])) 
        # print('xxxxxxXXXXXXX#######################################')
        # print('ngenclk_lines',ngenclk_lines)
        # print('mld_gclks',mld_gclks)      
        for gclk0 in mld_gclks:
            mld_gclk_tmp = []
            mld_num = 0
            sgclk = ''
            for xclk,xline in ngenclk_lines.items():                
                if xline[0] == gclk0:
                    sgclk = xclk
                    mld_gclk_tmp.append(xline)
                    mld_num += 1
            if mld_num == 1:
                sld_genclk_lines[sgclk] = ngenclk_lines[sgclk]
            if mld_num >= 2:
                mld_genclk_lines[gclk0] = mld_gclk_tmp
        
        # print('sld_genclk_lines+++++++++++++++++++++++++++',sld_genclk_lines)
        # print('mld_genclk_lines--------------------------',mld_genclk_lines)
            # del internal clkgrp  and hd input/output genclk with no driver or tie
            # trace from only crg/ip genclk and hd input/output genclk with no genclk or no loading
        if sld_genclk_lines:
            sldclks = sorted(sld_genclk_lines.keys())
            #for sclk,sline in sld_genclk_lines.items():
            for sclk in sldclks:
                sline = sld_genclk_lines[sclk]
                ngrpnm = ''
                ngrplst = []
                ugrplst = []

                if ' ' in sline[0]:
                    nvar = sline[0].split(' ')[0]
                    ncknm = sline[0].split(' ')[1]
                    if not nvar in curhd_hierals_var:
                        ngp = curhd_hierclkdata[sline[0]][0]
                        ngrpnm = f'$SDCVAR(GRPNM,${{{nvar}}},{ngp})'
                    else:
                        ngrpnm = f'$SDCVAR(NAME,${{{nvar}}},{ncknm})'
                else:
                    ngrpnm = f'$SDCVAR(NAME,${{{alias}}},{sline[0]})'
                for nclk in sline:
                    #if not nclk in all_hierinhd_pclk:
                    if ' ' in nclk:
                        nvar = nclk.split(' ')[0]
                        ncknm = nclk.split(' ')[1]
                        if not nvar in curhd_hierals_var:
                            ngp = curhd_hierclkdata[nclk][0]
                            ngrplst.append(f'$CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{nvar}}},{ngp}))')
                            if not nclk in sline[0]:
                                ugrplst.append(f'CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{nvar}}},{ngp}))')
                        else:
                            ngrplst.append(f'$SDCVAR(NAME,${{{nvar}}},{ncknm})')
                    else:
                        ngrplst.append(f'$SDCVAR(NAME,${{{alias}}},{nclk})')

                clkgrp_lines += f'''

        ## Clock Group: {sline[0]}               
        set CLOCK_GROUP_NAME({ngrpnm}) [concat {' '.join(ngrplst)}]
    '''
                clkgrp_lines = clkgrp_lines.rstrip()
                for cgrp in ugrplst:
                    clkgrp_lines += f'''
        unset {cgrp} 
    '''      
                    clkgrp_lines = clkgrp_lines.rstrip()

        if mld_genclk_lines:
            mldclks = sorted(mld_genclk_lines.keys())
            #for mclk,mlines in mld_genclk_lines.items():
            for mclk in mldclks:
                mlines = mld_genclk_lines[mclk]
                ngrpnm = ''
                ngrplst = []
                ugrplst = []

                if ' ' in mclk:
                    nvar = mclk.split(' ')[0]
                    ncknm = mclk.split(' ')[1]
                    if not nvar in curhd_hierals_var:
                        ngp = curhd_hierclkdata[mclk][0]
                        ngrpnm = f'$SDCVAR(GRPNM,${{{nvar}}},{ngp})'
                        ngrplst.append(f'$CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{nvar}}},{ngp}))')
                    else:
                        ngrpnm = f'$SDCVAR(NAME,${{{nvar}}},{ncknm})'
                        ngrplst.append(f'$SDCVAR(NAME,${{{nvar}}},{ncknm})')
                else:
                    ngrpnm = f'$SDCVAR(NAME,${{{alias}}},{mclk})'
                    ngrplst.append(f'$SDCVAR(NAME,${{{alias}}},{mclk})')
                for mline in mlines:
                    for nclk in mline[1:]:
                        #if not nclk in all_hierinhd_pclk:
                        if ' ' in nclk:
                            nvar = nclk.split(' ')[0]
                            ncknm = nclk.split(' ')[1]
                            if not nvar in curhd_hierals_var:
                                ngp = curhd_hierclkdata[nclk][0]
                                ngrplst.append(f'$CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{nvar}}},{ngp}))')
                                ugrplst.append(f'CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{nvar}}},{ngp}))')
                            else:
                                ngrplst.append(f'$SDCVAR(NAME,${{{nvar}}},{ncknm})')
                        else:
                            ngrplst.append(f'$SDCVAR(NAME,${{{alias}}},{nclk})')
                ngrplst = list(set(ngrplst))
                clkgrp_lines += f'''

        ## Clock Group: {mclk}               
        set CLOCK_GROUP_NAME({ngrpnm}) [concat {' '.join(ngrplst)}]
    '''
                clkgrp_lines = clkgrp_lines.rstrip()
                if ugrplst:
                    for cgrp in ugrplst:
                        clkgrp_lines += f'''
        unset {cgrp} 
    '''             
                        clkgrp_lines = clkgrp_lines.rstrip()

        if curhd_hier_inter_clkgrp:
            intclks = sorted(curhd_hier_inter_clkgrp.keys())
            #for igpnm,igplst in curhd_hier_inter_clkgrp.items():
            for igpnm in intclks:
                igplst = curhd_hier_inter_clkgrp[igpnm]
                ngrpnm = ''
                ngrplst = []
                ugrplst = []

                if ' ' in igpnm:
                    nvar = igpnm.split(' ')[0]
                    ncknm = igpnm.split(' ')[1]
                    if not nvar in curhd_hierals_var:
                        sdc_error(f'Can not find subhd block including {igpnm}.')
                    else:
                        ngrpnm = f'$SDCVAR(NAME,${{{nvar}}},{ncknm})'
                else:
                    ngrpnm = f'$SDCVAR(NAME,${{{alias}}},{igpnm})'
                for nclk in igplst:
                    if ' ' in nclk:
                        nvar = nclk.split(' ')[0]
                        ncknm = nclk.split(' ')[1]
                        if not nvar in curhd_hierals_var:
                            ngp = curhd_hierclkdata[nclk][0]
                            ngrplst.append(f'$CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{nvar}}},{ngp}))')
                            if not nclk in igpnm:
                                ugrplst.append(f'CLOCK_GROUP_NAME($SDCVAR(GRPNM,${{{nvar}}},{ngp}))')
                        else:
                            ngrplst.append(f'$SDCVAR(NAME,${{{nvar}}},{ncknm})')
                    else:
                        ngrplst.append(f'$SDCVAR(NAME,${{{alias}}},{nclk})')
                clkgrp_lines += f'''
        ## Clock Group: {igpnm}               
        set CLOCK_GROUP_NAME({ngrpnm}) [concat {' '.join(ngrplst)}]
    '''
                clkgrp_lines = clkgrp_lines.rstrip()
                if ugrplst:
                    for cgrp in ugrplst:
                        clkgrp_lines += f'''
        unset {cgrp} 
    ''' 
                        clkgrp_lines = clkgrp_lines.rstrip()

        if curhd_hier_phylog_clkgrp:
            clkgrp_lines += f'{curhd_hier_phylog_clkgrp}'

        return clkgrp_lines
            
        #         # del internal clkgrp  and hd input/output genclk with no driver or tie
        #         # trace from only crg/ip genclk and hd input/output genclk with no genclk or no loading
        #         pass



    def get_curhd_portclks(self,blk):
        cblk_clkport = {}
        inhd_pclk = {}
        outhd_pclk = {}
        hblk = self._hiertree.get_block_by_name(blk)        
        hals = hblk.alias
        hdblks = hblk.get_curhd_by_name()
        if hdblks:
            for sblk in hdblks:
                blk = self._hiertree.get_block_by_name(sblk)
                bals = blk.alias

                if self._hiertree.proj:
                    cblk_file = blk.constr_dir + f'sdcgen/json/{bals.lower()}_hdclkportinfo.json'
                else:                   
                    cblk_file = self._sdcdir + f'/../../{sblk}/sdcgen/json' + f'/{bals.lower()}_hdclkportinfo.json'
        # if os.path.exists(cblk_file):
        #     # portclksinfo[f'{alias} HDOUT {inport} {clknm}'] = []
        #     cblk_clkport = self.read_json(cblk_file) 

        #print('get_curhd_portclks:cblk_clkport',cblk_clkport)
        # for bky,bvl in cblk_clkport.items():
        #     sky = bky.split(' ')
        #     if sky[1] == 'HDIN':
        #         inhd_pclk[f'{sky[0]} {sky[3]}'] = bvl
        #     if sky[1] == 'HDOUT':
        #         outhd_pclk[f'{sky[0]} {sky[3]}'] = bvl
                if os.path.exists(cblk_file):
                    cblk_clkport = self.read_json(cblk_file) 
                    if cblk_clkport:
                        ridx = [i for i,ele in enumerate(hblk._cust_insts['instref']) if ele==sblk]           
                        if ridx:
                            for idx in ridx:
                                if hblk._cust_insts['instalias'][idx]:
                                    als = hblk._cust_insts['instalias'][idx]
                                else:
                                    als = bals
                                #nals = hals + '_' + als
                                for ky,vl in cblk_clkport.items():
                                    # '{self._alias} HDIN {inport} {clknm}'
                                    kals = ky.split(' ')[0]
                                    kw = ky.split(' ')[1]
                                    port = ky.split(' ')[2]
                                    clknm = ky.split(' ')[3]
                                    #nky = f'{als} {kw} {port} {kals}_{clknm}'
                                    nky = f'{kals} {kw} {port} {als}_{clknm}'
                                    fclknm = f'{kals} {als}_{clknm}'
                                    #nky = f'{kw}_{port}'
                                    #nblk_clkport[nky] = vl
                                    #nals = hals + '_' + als + '_' + kals
                                    if kw == 'HDIN':
                                        inhd_pclk[fclknm] = vl
                                    if kw == 'HDOUT':
                                        outhd_pclk[fclknm] = vl
                                #portclkinfo_intg[nals] = nblk_clkport 
                    else:
                        sdc_warn(f'Empty {bals.lower()}_hdclkportinfo.json file of {blk}')                        
                else:
                    sdc_warn(f'Missing {bals.lower()}_hdclkportinfo.json file of {blk}')

        return inhd_pclk,outhd_pclk


    def get_genclk_lines_intg(self,hierclklst,hierclkdata,kw='json'):
        genclk_lines = {}
        genline_clks = []

        if hierclklst:
            for clknm in hierclklst:
                if hierclkdata[clknm][3] and hierclkdata[clknm][4]:
                    #genclk_lines[clknm] = self.get_srcclk_intg(hierclkdata,clknm,srclst=[])
                    genclk_lines[clknm] = self.get_srcclk(hierclkdata,clknm,srclst=[])
                    gclktmp = [x for x in genclk_lines[clknm] if x in hierclklst]
                    genclk_lines[clknm] = gclktmp
                    genline_clks.extend(gclktmp)
            
            diff_genclks = list(set(hierclklst)^set(genline_clks))
            #print('diff_genclks++++++++++++++++++:',diff_genclks)
            if diff_genclks:
                sdc_warn(f'Must check clkgrp with single clk: {diff_genclks}. Maybe unconnected or input created clk.')
                for x in diff_genclks:
                    if not ' ' in x and x in self._clknmlst:
                        genclk_lines[x] = [x]

        if kw == 'json':
            self._data = genclk_lines
            json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_curhdhier_genclk_lines.json'
            self.write_json(json_file)

        return genclk_lines

    def get_srcclk_intg(self,tclkdata,genclk,srclst=[]):
        srclst.append(genclk)
        #divedge = self._clknmdata[genclk][3]
        #mstclk = self._clknmdata[genclk][4]
        #if genclk in tclkdata:
        divedge = tclkdata[genclk][3]
        mstclk = tclkdata[genclk][4]
        #als = genclk.split(' ')[0]       
        if divedge and mstclk:
            # if not ' ' in mstclk.strip():
            #     mstclk = f'{als} {mstclk.strip()}'
            self.get_srcclk_intg(tclkdata,mstclk,srclst)
        # else:
        #     sdc_info(f'Not Found {genclk} in hier flattern clk intg list.')

        return srclst[::-1]
    
    def set_phylog_clkgrp(self,mdname,alias,clknmlst,clknmdata,kw1,kw2,mode=''):
        clkgrp_lines = ''
        tplkey = []
        #phyclks = []
        nclknmlst = []
        nclknmdata = {}
        if mode == 'intg':
            nclknmlst = [x.split(' ')[1] for x in clknmlst]
            nclknmdata = {k.split(' ')[1]:v for k,v in clknmdata.items()}
        else:
            nclknmlst = clknmlst
            nclknmdata = clknmdata
        for clknm in nclknmlst:
            cmt = nclknmdata[clknm][8]
            if cmt:
                if f'{kw1}GRP' in cmt:
                    #phyclks.append(clknm)
                    if '&' in cmt:
                        pkey = cmt.split('&')
                        skey = [x for x in pkey if f'{kw1}GRP' in x]
                        skey = skey[0].strip()
                    else:
                        skey = cmt.strip()
                    tplkey.append(skey)
        #print('set_phylog_clkgrp',tplkey)
        if tplkey:
            tplkey = list(set(tplkey)) 
            # PHYGRP_A_1 PHYGRP_A_2, PHYGRP_B_1 PHYGRP_B_2
            phydict = {}            
            for key in tplkey:
                clklst = []
                for clknm in nclknmlst:
                    cmt = nclknmdata[clknm][8]
                    if cmt:
                        if key in cmt:
                            clklst.append(clknm)
                phydict[key] = clklst
            
            skey = []
            for pky in phydict.keys():
                skey.append('_'.join(pky.split('_')[0:2]))
            #print('skey',skey,'phydict',phydict)
            skey = list(set(skey))
            fkey = []
            for fky in skey:
                sky = ''
                for nky in phydict.keys():
                    if fky in nky:
                        sky += f'{nky} '
                # ['PHYGRP_A_1 PHYGRP_A_2','PHYGRP_B_1 PHYGRP_B_2']
                fkey.append(sky.rstrip())
            #print('set_phylog_clkgrp',skey,'fkey:',fkey,'phydict:',phydict)
            for tk in fkey:
                tclkgrp_lines = ''
                rkey = tk.split(' ')
                pnm = '_'.join(rkey[0].split('_')[0:2])
                pname = f'{kw1.lower()}_clock_group_{pnm}'
                clkgrp_lines += f'''


# {kw2} clock group:  {alias}_{pname}               
set_clock_groups -name {alias}_{pname} -{kw2}_exclusive \\
'''             
                clkgrp_lines=clkgrp_lines.rstrip()
                #print('rkey',rkey)
                for pk in rkey:
                    #tmpline = ''
                    grplst = []
                    for cknm in phydict[pk]:
                        grplst.append(f'$SDCVAR(NAME,${{{alias}}},{cknm})')
                    clkgrp_lines += f'''
-group [list {' '.join(grplst)}] \\
'''
                    clkgrp_lines=clkgrp_lines.rstrip()

                clkgrp_lines=clkgrp_lines.rstrip().rstrip('\\')

        else:
            sdc_info(f'Not find -physically_exclusive clock group setting in clkdef of {mdname}')

        #print('clkgrp_lines',clkgrp_lines)
        return clkgrp_lines


    def get_hierclk_intg(self):
        # get all of subblk hier clks from subblk grpnm and grplst and genclklines
        # get clk connection using cintg and octype, multi_loading with same driver
        # set mclk/div value of hdport input clk and crgip input clk attr. according to connection 
        # new genclklines through diff. harden level
        # from internal clkgrp to hier clkgrp according to original subblk clkdef clkgrp
        # check every clk with one clkgrp setting
        ## firstly set mclk&div&grpnm&clkintg&outclktype of all level clks user_defined
        ## secondly set internal clkgrp for every level harden block from bottom to top,
        #       -but internal clk grpname DONOT include crgip related clk for subblks
        #       -but internal clk grplst DONOT include outport genclk for subblks
        #       -but DONOT include input and virtual clock for subblks
        ## thirdly set forward traceback genclkline from bottom to top  and backward traceback genclkline from top to bottom 
        # trace back clk type of start points for genclk lines generation in genclk pool:
        #   -crg IN
        #   -ip IN
        #   -internal genclk with no child genclk
        #   -harden subblk input crtclk with no loading or no child genclk
        #   -harden subblk output genclk with no loading or no child genclk
        #   -output genclk of current harden blk
        #   -feedthrough clk path

        # hblks according to hd level
        hdblk_lvl = {}
        blklvl = []
        all_hdblks = self._hiertree.get_hierlvlblks(self._mdname,outtype='hd')
        for hblk in all_hdblks:
            bkals,bkhier = self._hiertree.get_hier_alias_hier(self._mdname,hblk)
            for bal in bkals:
                nlvl = len(bal.split('_'))
                blklvl.append(f'{nlvl}|{bal}|{hblk}')
        lvl = list(set([x.split('|')[0] for x in blklvl]))
        #print(f'dbg1:{lvl} {blklvl}')
        for n in lvl:
            slblk = []
            for blvl in blklvl:
                xb = blvl.split('|')
                if xb[0] == str(n):
                    xb1 = xb[1]
                    xb2 = xb[2]                                    
                    slblk.append(f'{xb1}|{xb2}')
            hdblk_lvl[f'hdlvl{str(n)}'] = slblk
        hdblk_lvl[f'hdlvl1'] = [f'{self._alias}|{self._mdname}']

        # 'alias clknm'
        curhd_allclknm_intg = []
        curhd_allclkdata_intg = {}
        curhd_inter_clkgrp_intg = {}
        #curhd_iogrplst_intg = {}
        #curhd_scrgip_intg = {}
        curhd_phylog_clkgrp_intg = ''
        hdkeys = sorted(hdblk_lvl.keys())[::-1]
        #print('curhdkeys',hdkeys)
        for key in hdkeys:
            hdblks = hdblk_lvl[key]
            #print('curhdhdblks',hdblks)
            for bk in hdblks:
                blk = bk.split('|')[-1]
                #print('curbk',blk)
                cblk = self._hiertree.get_block_by_name(blk)
                bals = cblk.alias
                bval = bk.split('|')[0]
                clknmlst = []
                clknmdata = {}

                # clkdef
                if blk == self._mdname:
                    nclknm = []
                    nclkdata = {}
                    # curhd_allclknm_intg.extend(self._clknmlst)
                    # curhd_allclkdata_intg.update(self._clknmdata)
                    clknmlst,clknmdata = self.concat_curhd_crgiphd_connect('flt')
                    #print('concat_curhd_crgiphd_connectXXXXXXXXXXX:',clknmdata)
                    
                    exlu_clklst = []
                    clkdefgrp = self.get_clkgrp_from_clkdef()
                    #print('clkdefgrp:###########################:',clkdefgrp)
                    for gpnm,gplst in clkdefgrp.items():
                        if not self.is_inps_crtclk(clknmdata,gpnm) and not re.search(r'IN|OUT',str(clknmdata[gpnm][6])) and not self.is_oups_genclk(clknmdata,gplst[-1]):
                            #curhd_inter_clkgrp_intg[f'{self._alias} {gpnm}'] = gplst
                            curhd_inter_clkgrp_intg[f'{gpnm}'] = gplst
                            exlu_clklst.extend(gplst)
                    #print('topblk:exlu_clklst+++++++++++++++++++++:',exlu_clklst)
                    if exlu_clklst:
                        nclknmlst = [x for x in clknmlst if not x in exlu_clklst]
                    else:
                        nclknmlst = clknmlst
                    for nval in nclknmlst:
                        #if not self.is_inps_crtclk(nval) and not self.is_oups_genclk(nval):
                        if not nval in curhd_allclknm_intg:
                            nclkdata[nval] = clknmdata[nval]
                            nclknm.append(nval)

                    # for gpnm,gclks in curhd_inter_clkgrp_intg.items():
                    #     clknmdata[gclks[-1]][3] = None
                    #     clknmdata[gclks[-1]][4] = None

                    # for gclk,gcinfo in nclkdata.items():
                    #     if clknmdata[gclk][4]:
                    #         if not clknmdata[gclk][4] in nclknm and not self.is_oups_genclk(clknmdata,gclk):
                    #             #clknmdata[gclk][3] = None
                    #             print('UUUUUUUEEEEEXXX:',gclk)
                    #             clknmdata[gclk][4] = None

                    # +++++need cover outpclk, but not cover inpclk+++++++!!!!!!!!!!!!!!
                    curhd_allclknm_intg.extend(nclknm)
                    curhd_allclkdata_intg.update(nclkdata)
                    # print('topblk:clknmlst:',blk,clknmlst)
                    #print('topblk:+++++++++++++++++curhd_allclkdata_intg:',curhd_allclkdata_intg)
                    #curhd_phylog_clkgrp_intg += self.set_phylog_clkgrp(blk,bals,self._clknmlst,self._clknmdata,'PHY','physically')
                    #curhd_phylog_clkgrp_intg += self.set_phylog_clkgrp(blk,bals,self._clknmlst,self._clknmdata,'LOG','logically')

                else:
                    fclkdef = self.get_data_from_json_intg(blk,'clkdef.json','full')
                    if fclkdef:
                        fbk = self._hiertree.get_fblk(self._mdname,blk)
                        fblk = self._hiertree.get_block_by_name(fbk[0])
                        blks = fblk.get_curhd_by_name()
                        mimhd_als = []
                        if blks:
                            ridx = [i for i,ele in enumerate(fblk._cust_insts['instref']) if ele==blk]           
                            if ridx:
                                for idx in ridx:
                                    als = fblk._cust_insts['instalias'][idx]
                                    if als:
                                        mimhd_als.append(als)
                                    else:
                                        mimhd_als.append(bals)
                        #print('fclkdef:',blk,mimhd_als)

                        nclknm = []
                        nclkdata = {}
                        xclknmlst = []
                        xclknmdata = {}
                        for val in mimhd_als:
                            # ClkNm	ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment
                            clknmlst,clknmdata = self.get_clkdata_from_clkdef_intg(blk,bals,val,fclkdef)
                            if clknmlst:
                                xclknmlst.extend(clknmlst)
                            if clknmdata:
                                xclknmdata.update(clknmdata)
                            
                            #self.get_clkdata_by_clkname(fclkdef)
                            clkgrp,inclklst,outclklst = self.get_clkgrp_from_clkdef_intg(blk,clknmlst,clknmdata)
                            # print('subblk:clkgrp',clkgrp)
                            #print('subblk:inclklst',inclklst)
                            #print('subblk:outclklst',outclklst)

                            exlu_clklst = []
                            for gkey,gval in clkgrp.items():
                                if not gkey in inclklst and not re.search(r'IN|OUT',str(clknmdata[gkey][6])) and not gval[-1] in outclklst:
                                    curhd_inter_clkgrp_intg[gkey] = gval
                                    #clknmdata[gkey][4] = None
                                    exlu_clklst.extend(gval)
                            # print('subblk:exlu_clklst',exlu_clklst)
                            if exlu_clklst:
                                nclknmlst = [x for x in clknmlst if not x in exlu_clklst]
                            else:
                                nclknmlst = clknmlst
                            for nval in nclknmlst:
                                #if not nval in inclklst and not nval in outclklst:
                                #if not nval in curhd_allclknm_intg and not nval in inclklst and not nval in outclklst:
                                if not nval in curhd_allclknm_intg and not nval in inclklst:
                                    nclkdata[nval] = clknmdata[nval]
                                    nclknm.append(nval)
                            #print('nclknm:',nclknm)

                            for gclk,gcinfo in nclkdata.items():
                                if clknmdata[gclk][4]:   
                                    inter_grps = [x[-1] for x in curhd_inter_clkgrp_intg.values()]                     
                                    if clknmdata[gclk][4] in inter_grps and not gclk in outclklst:
                                        #clknmdata[gclk][3] = None
                                        clknmdata[gclk][4] = None
                        
                            curhd_allclknm_intg.extend(nclknm)
                            curhd_allclkdata_intg.update(nclkdata)
                            # print('subblk:clknmlst:',blk,clknmlst)
                            #print('subblk:curhd_allclknm_intg:',blk,curhd_allclknm_intg)
                            #print('subblk:curhd_allclkdata_intg:',blk,curhd_allclkdata_intg)

                            curhd_phylog_clkgrp_intg += self.set_phylog_clkgrp(blk,bals,clknmlst,clknmdata,'PHY','physically','intg')
                            curhd_phylog_clkgrp_intg += self.set_phylog_clkgrp(blk,bals,clknmlst,clknmdata,'LOG','logically','intg')
                    

                        # crgip
                        scrgip = self.get_data_from_json_intg(blk,'_header.json','semi')
                        #print('_header.json:',blk,scrgip)
                        #shd = self.get_data_from_json_intg(blk,'_clkport.json','semi')
                        # if not self._curhd_portclks:
                        #     self.get_curhd_clkportinfo_intg(blk)  
                        # shdport = self._curhd_portclks
                        # shd = self._curhd_portclksinfo 
                        shdpclk = self.get_subhd_clkportinfo_intg(blk)
                        #print('subhd_clkportinfo_int:',shdpclk)
                        if  clknmlst and scrgip or shdpclk:
                            crgclknmlst,crgclknmdata,ipclknmlst,ipclknmdata,hdclknmlst,hdclknmdata = self.concat_subhd_crgiphd_connect_intg(scrgip,shdpclk,xclknmlst,xclknmdata)    
                        
                        if scrgip:
                            #crgclknmlst,crgclknmdata = self.concat_subhd_crgiphd_connect_intg(scrgip,shd,clknmlst,clknmdata,'crg')                          
                            if crgclknmlst:
                                curhd_allclknm_intg.extend(crgclknmlst)
                                curhd_allclkdata_intg.update(crgclknmdata) 
                            #ipclknmlst,ipclknmdata = self.concat_subhd_crgiphd_connect_intg(scrgip,shd,clknmlst,clknmdata,'ip')
                            if ipclknmlst:
                                curhd_allclknm_intg.extend(ipclknmlst)
                                curhd_allclkdata_intg.update(ipclknmdata)

                        # hd 
                        if shdpclk:
                            #hdclknmlst,hdclknmdata = self.concat_subhd_crgiphd_connect_intg(scrgip,shd,clknmlst,clknmdata,'hd')                          
                            if hdclknmlst:
                                curhd_allclknm_intg.extend(hdclknmlst)
                                curhd_allclkdata_intg.update(hdclknmdata)
                    
                    else:
                        print(f'SDC_ERROR:Empty clkdef.json file of {blk}')
                    
        return curhd_allclknm_intg,curhd_allclkdata_intg,curhd_inter_clkgrp_intg,curhd_phylog_clkgrp_intg

    def get_subhd_clkportinfo_intg(self,name):
        #portclk_intg = {}
        portclkinfo_intg = {}
        nblk_clkport  = {}
        # hdblksg = self._hiertree.get_hierlvlblks(mdname,outtype='hd')
        # hdblks = [x for x in hdblksg if not x is mdname]
        hblk = self._hiertree.get_block_by_name(name)
        hals = hblk.alias
        hdblks = hblk.get_curhd_by_name()
        if hdblks:
            for sblk in hdblks:
                blk = self._hiertree.get_block_by_name(sblk)
                bals = blk.alias

                if self._hiertree.proj:
                    cblk_file = blk.constr_dir + f'sdcgen/json/{bals.lower()}_hdclkportinfo.json'
                else:                   
                    cblk_file = self._sdcdir + f'/../../{sblk}/sdcgen/json' + f'/{bals.lower()}_hdclkportinfo.json'
                if os.path.exists(cblk_file):
                    cblk_clkport = self.read_json(cblk_file) 
                    if cblk_clkport:
                        ridx = [i for i,ele in enumerate(hblk._cust_insts['instref']) if ele==sblk]           
                        if ridx:
                            for idx in ridx:
                                if hblk._cust_insts['instalias'][idx]:
                                    als = hblk._cust_insts['instalias'][idx]
                                else:
                                    als = bals
                                #nals = hals + '_' + als
                                for ky,vl in cblk_clkport.items():
                                    # '{self._alias} HDIN {inport} {clknm}'
                                    kvar = ky.split(' ')[0]
                                    kw = ky.split(' ')[1]
                                    port = ky.split(' ')[2]
                                    clknm = ky.split(' ')[3]
                                    #nky = f'{als} {kw} {port} {kals}_{clknm}'
                                    nky = f'{kvar} {kw} {port} {als}_{clknm}'
                                    #nky = f'{kw}_{port}'
                                    if kw == 'HDIN':
                                        nblk_clkport[nky] = vl
                                    if kw == 'HDOUT':
                                        vlg = f'{kvar} {als}_{vl[4]}'
                                        nblk_clkport[nky] = [vl[0],vl[1],vl[2],vl[3],vlg,vl[5],vl[6],vl[7],vl[8]]
                                    nals = hals + '_' + als + '_' + kvar
                                portclkinfo_intg[nals] = nblk_clkport 
                    else:
                        sdc_warn(f'Empty {bals.lower()}_hdclkportinfo.json file of {blk}')                        
                else:
                    sdc_warn(f'Missing {bals.lower()}_hdclkportinfo.json file of {blk}')

        return portclkinfo_intg


    def concat_subhd_crgiphd_connect_intg(self,scrgip,shd,clknmlst,clknmdata,otype='crg'):
        crgclknmlst = []
        crgclknmdata = {}
        ipclknmlst = []
        ipclknmdata = {}       
        hdclknmlst = []
        hdclknmdata = {}

        clkdefin_clkintg = {}
        crgin_ctype = {}
        ipin_ctype = {}
        clkdefout_clkintg = {}
        crgout_clkintg = {}
        ipout_clkintg = {} 
        hdclklst = []
        hdclkdata = {}
        # def2crg = False
        # def2ip = False
        # def2hd = False
        # #def2def = False
        # crg2ip = False
        # crg2crg = False
        # crg2hd = False
        # crg2def = False
        # ip2crg = False
        # ip2ip = False
        # ip2def = False
        # ip2hd = False 
        # hd2def = False

        crgdata = {}
        ipdata = {}
        # "SYSCAM_CAMCRG1_CAMCRG_CRG_CRG_Row14": {
        # "IntgType": "CRGIN",
        # "ClkPort": "clk_cam",
        # "MstClkNm": "CAMCRG1_NAME_clk_cam_gen",
        # "SrcPinNm": "CAMCRG1_HIER_clk_cam_gen",
        # "ClkGrpNm": "CAMCRG1_NAME_clk_cam_gen",
        # "OutClkType": "None",
        # "ClkPeriod": "None"
        # },

        # 'MCUJPEG MCUJPEG_clk_jpg_weq': []
        # ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment
        if clknmlst:
            for clknm in clknmlst:
                ckintg = clknmdata[clknm][6]
                if ckintg:
                    if re.search(r'IN',ckintg):
                        clkdefin_clkintg[clknm] = ckintg.replace(' ','')
                    if re.search(r'OUT',ckintg):
                        clkdefout_clkintg[clknm] = ckintg.replace(' ','')

        #{'MCUJPEG_JPEG_JPEG': {'JPEG HDIN clk_cr8 JPEG_clk_cr8_spg': []}}
        #print('subhd_crgiphd_connec: shd :',shd)
        if shd:
            for cky,cvl in shd.items():
                # cky: hals + '_' + als + '_' + kals
                hval = cky.split('_')[1]
                hvar = cky.split('_')[2]
                for hky,hvl in cvl.items():
                    # hky: f'{als} {kw} {port} {clknm}'
                    hsw = hky.split(' ')[1] # 'HDIN' 'HDOUT'                   
                    hport = hky.split(' ')[2]
                    hclknm = hky.split(' ')[3]
                    hkw = f'{hval}_{hsw}{hport}'
                    hdclklst.append(f'{cky} {hkw} {hclknm}')
                    hdclkdata[f'{cky} {hkw} {hclknm}'] = hvl

        # 'MCUJPEG_MCUCRG_MCRG(var)_CRG_Row1: {}
        # "SYSCAM_CAMCRG1_CAMCRG_CRG_CRG_Row14": {}
        # IntgType ClkPort MstClkNm SrcPinNm ClkGrpNm OutClkType ClkPeriod
        # ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment
        if scrgip:
            crgdata = {k:v for k,v in scrgip.items() if '_CRG_' in k}
            ipdata = {k:v for k,v in scrgip.items() if '_IP_' in k}
        
        if crgdata:
            for cky,cvl in crgdata.items():
                kw = cvl['IntgType']
                port = cvl['ClkPort']
                cknm = cvl['MstClkNm']
                ckintg = cvl['OutClkType']
                val = cky.split('_')[1]
                var = cky.split('_')[2]
                if kw == 'CRGIN':
                    #nckintg = ckintg.replace('IO','').replace('(','').replace(')','')                
                    crgin_ctype[cky] = [f'{val}_{kw}{port}',f'{var} {cknm}']
                if kw == 'CRGOUT' and ckintg:
                    nckintg = ckintg.replace('IO','').replace('(','').replace(')','')
                    crgout_clkintg[cky] = [f'{val}_{kw}{port}',f'{nckintg}',f'{var} {cknm}']

        if ipdata:
            for cky,cvl in ipdata.items():
                kw = cvl['IntgType']
                port = cvl['ClkPort']
                cknm = cvl['MstClkNm']
                ckintg = cvl['OutClkType']
                val = cky.split('_')[1]
                var = cky.split('_')[2]
                if kw == 'IPIN':
                    #nckintg = ckintg.replace('IO','').replace('(','').replace(')','')                
                    ipin_ctype[cky] = [f'{val}_{kw}{port}',f'{var} {cknm}']
                if kw == 'IPOUT' and ckintg:
                    nckintg = ckintg.replace('IO','').replace('(','').replace(')','')
                    ipout_clkintg[cky] = [f'{val}_{kw}{port}',f'{nckintg}',f'{var} {cknm}']
        
        # print('ipin_ctype:',ipin_ctype)
        # print('ipout_clkintg:',ipout_clkintg)
    # need cover unconnected port clk ??
#########################################
        if clkdefin_clkintg:
            for cky,cvl in clkdefin_clkintg.items():
                # clkdef to crg
                if 'CRGIN' in cvl:
                    xclknmlst,xclknmdata = self.set_clkdef_crgip(cky,cvl,crgin_ctype,crgdata,clknmdata)
                    if xclknmlst:
                        crgclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        crgclknmdata.update(xclknmdata)
                # clkdef to ip
                if 'IPIN' in cvl:
                    xclknmlst,xclknmdata = self.set_clkdef_crgip(cky,cvl,ipin_ctype,ipdata,clknmdata)
                    if xclknmlst:
                        ipclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        ipclknmdata.update(xclknmdata)
                # clkdef to hd
                if 'HDIN' in cvl:
                    xclknmlst,xclknmdata = self.set_clkdef_hd(cky,cvl,hdclklst,hdclkdata,clknmdata)
                    if xclknmlst:
                        hdclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        hdclknmdata.update(xclknmdata)

        if clkdefout_clkintg:
            for cky,cvl in clkdefout_clkintg.items():
                # crg to clkdef(GEN)
                if 'CRGOUT' in cvl:
                    xclknmlst,xclknmdata = self.set_crgip_clkdef(cky,cvl,crgout_clkintg,crgdata,clknmdata)
                    if xclknmlst:
                        crgclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        crgclknmdata.update(xclknmdata)

                # ip to clkdef(GEN)
                if 'IPOUT' in cvl:
                    xclknmlst,xclknmdata = self.set_crgip_clkdef(cky,cvl,ipout_clkintg,ipdata,clknmdata)
                    if xclknmlst:
                        ipclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        ipclknmdata.update(xclknmdata)
                
                # hd to clkdef
                if 'HDOUT' in cvl:
                    xclknmlst,xclknmdata = self.set_hd_clkdef(cky,cvl,hdclklst,hdclkdata,clknmdata)
                    if xclknmlst:
                        hdclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        hdclknmdata.update(xclknmdata)

        if crgout_clkintg:
            for cky,cvl in crgout_clkintg.items():
                nkw = cvl[0]
                nclkintg = cvl[1]
                nclknm = cvl[2]
                # crg to crg
                if 'CRGIN' in nclkintg:
                    xclknmlst,xclknmdata,yclknmlst,yclknmdata = self.set_crgip_crgip(cky,cvl,crgin_ctype,crgdata,crgdata)
                    if xclknmlst:
                        crgclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        crgclknmdata.update(xclknmdata)
                    if yclknmlst:
                        crgclknmlst.extend(yclknmlst)
                    if yclknmdata:
                        crgclknmdata.update(yclknmdata)

                # crg to ip
                if 'IPIN' in nclkintg:
                    xclknmlst,xclknmdata,yclknmlst,yclknmdata = self.set_crgip_crgip(cky,cvl,ipin_ctype,ipdata,crgdata)
                    if xclknmlst:
                        ipclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        ipclknmdata.update(xclknmdata)
                    if yclknmlst:
                        crgclknmlst.extend(yclknmlst)
                    if yclknmdata:
                        crgclknmdata.update(yclknmdata)

                # crg to hd
                if 'HDIN' in nclkintg:
                    xclknmlst,xclknmdata,yclknmlst,yclknmdata = self.set_crgip_hd(cky,cvl,hdclklst,hdclkdata,crgdata)
                    if xclknmlst:
                        hdclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        hdclknmdata.update(xclknmdata)
                    if yclknmlst:
                        crgclknmlst.extend(yclknmlst)
                    if yclknmdata:
                        crgclknmdata.update(yclknmdata)


        if ipout_clkintg:
            for cky,cvl in ipout_clkintg.items():
                nkw = cvl[0]
                nclkintg = cvl[1]
                nclknm = cvl[2]
                # ip to ip
                if 'CRGIN' in nclkintg:
                    xclknmlst,xclknmdata,yclknmlst,yclknmdata = self.set_crgip_crgip(cky,cvl,ipin_ctype,ipdata,ipdata)
                    if xclknmlst:
                        ipclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        ipclknmdata.update(xclknmdata)
                    if yclknmlst:
                        ipclknmlst.extend(yclknmlst)
                    if yclknmdata:
                        ipclknmdata.update(yclknmdata)

                # ip to crg
                if 'IPIN' in nclkintg:
                    xclknmlst,xclknmdata,yclknmlst,yclknmdata = self.set_crgip_crgip(cky,cvl,crgin_ctype,crgdata,ipdata)
                    if xclknmlst:
                        crgclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        crgclknmdata.update(xclknmdata)
                    if yclknmlst:
                        ipclknmlst.extend(yclknmlst)
                    if yclknmdata:
                        ipclknmdata.update(yclknmdata)

                # ip to hd
                if 'HDIN' in nclkintg:
                    xclknmlst,xclknmdata,yclknmlst,yclknmdata = self.set_crgip_hd(cky,cvl,hdclklst,hdclkdata,ipdata)
                    if xclknmlst:
                        hdclknmlst.extend(xclknmlst)
                    if xclknmdata:
                        hdclknmdata.update(xclknmdata)
                    if yclknmlst:
                        ipclknmlst.extend(yclknmlst)
                    if yclknmdata:
                        ipclknmdata.update(yclknmdata)

        if hdclklst:
            # hd to crgip ??
            pass

        # print('ipclknmdata:',ipclknmdata)
        # print('crgclknmdata:',crgclknmdata)
        # print('hdclknmdata:',hdclknmdata)

        return crgclknmlst,crgclknmdata,ipclknmlst,ipclknmdata,hdclknmlst,hdclknmdata

    def set_crgip_hd(self,cky,cvl,hdclklst,hdclkdata,crgdata):
        xclknmlst = []
        xclknmdata = {}
        yclknmlst = []
        yclknmdata = {}
        if hdclklst:
            for nky in hdclklst:
                sp = nky.split(' ')
                nval = sp[0].split('_')[1]
                nvar = sp[0].split('_')[2]
                if sp[1] in cvl[1]:
                    rclknm = f'{nvar} {sp[2]}'
                    hdt = hdclkdata[nky]
                    rmclk = cvl[2]
                    ffreq = crgdata[cky]['ClkPeriod']
                    #ffreq = hdclkata[nky][1]
                    rmdiv = '1'
                    if ffreq:
                        if '|' in ffreq:
                            for x in range(1,len(ffreq.split('|'))):
                                rmdiv += '|1'
                    xclknmlst.append(f'{rclknm}')
                    xclknmdata[f'{rclknm}'] = [f'{hdt[0]}',f'{hdt[1]}','',f'{rmdiv}',f'{rmclk}',f'{hdt[5]}',f'{hdt[6]}',f'{hdt[7]}',f'{hdt[8]}']
        
                if not 'GEN' in cvl[1]:
                    rclknm = cvl[2]
                    rgrpnm = crgdata[cky]['ClkGrpNm']
                    rfreq = crgdata[cky]['ClkPeriod']
                    rintg = cvl[1]  #crgdata[nky]['OutClkType']
                    rport = crgdata[nky]['SrcPinNm']
                    yclknmlst.append(f'{rclknm}')
                    yclknmdata[f'{rclknm}'] = [f'{rgrpnm}',f'{rfreq}','','','',f'{rport}',f'{rintg}','','']
                        
        else:
            sdc_info(f'Not found connection from clknm "{cky}" with clkintg "{cvl}" of clkdef to hd')
        
        # print('set_crgip_hd+++++++++++')
        # print('xclknmdata: ',xclknmdata)
        # print('yclknmdata: ',yclknmdata)
        
        return xclknmlst,xclknmdata,yclknmlst,yclknmdata
    
    def set_crgip_crgip(self,cky,cvl,crgin_ctype,crgdata,ipdata):
        xclknmlst = []
        xclknmdata = {}
        yclknmlst = []
        yclknmdata = {}
        if crgin_ctype:
            for nky,nvl in crgin_ctype.items():
                nkey = '_'.join(nky.split('_')[:-2])
                if nvl[0] in cvl[1]:
                    rclknm = nvl[1]
                    rgrpnm = crgdata[nky]['ClkGrpNm']
                    rport = crgdata[nky]['SrcPinNm']
                    rmclk = cvl[2]
                    ffreq = ipdata[cky]['ClkPeriod']
                    rmdiv = '1'
                    if ffreq:
                        if '|' in ffreq:
                            for x in range(1,len(ffreq.split('|'))):
                                rmdiv += '|1'
                    xclknmlst.append(f'{rclknm}')
                    xclknmdata[f'{rclknm}'] = [f'{rgrpnm}','','',f'{rmdiv}',f'{rmclk}',f'{rport}','','',f'{nkey}']
        
                if not 'GEN' in cvl[1]:
                    rclknm = cvl[2]
                    rgrpnm = ipdata[cky]['ClkGrpNm']
                    rfreq = ipdata[cky]['ClkPeriod']
                    rintg = cvl[1]  #crgdata[nky]['OutClkType']
                    rport = ipdata[cky]['SrcPinNm']
                    yclknmlst.append(f'{rclknm}')
                    yclknmdata[f'{rclknm}'] = [f'{rgrpnm}',f'{rfreq}','','','',f'{rport}',f'{rintg}','',f'{nkey}']
                           
        else:
            sdc_info(f'Not found connection from clknm "{cky}" with clkintg "{cvl}" of clkdef to crgin')
        
        return xclknmlst,xclknmdata,yclknmlst,yclknmdata

    def set_hd_clkdef(self,cky,cvl,hdclklst,hdclkata,clknmdata):
        xclknmlst = []
        xclknmdata = {}
        if hdclklst:
            for nky in hdclklst:
                sp = nky.split(' ')
                nval = sp[0].split('_')[1]
                nvar = sp[0].split('_')[2]
                hvl = hdclkata[nky]
                #print('set_hd_clkdef',cvl,nky)
                if sp[1] in cvl:
                    rclknm = f'{nvar} {sp[2]}'
                    xclknmlst.append(f'{rclknm}')
                    xclknmdata[f'{rclknm}'] = [f'{hvl[0]}',f'{hvl[1]}',f'{hvl[2]}',f'{hvl[3]}',f'{hvl[4]}',f'{hvl[5]}',f'{hvl[6]}',f'{hvl[7]}',f'{hvl[8]}']                    

        return xclknmlst,xclknmdata


    def set_crgip_clkdef(self,cky,cvl,crgout_clkintg,crgdata,clknmdata):
        xclknmlst = []
        xclknmdata = {}
        if crgout_clkintg:
            for nky,nvl in crgout_clkintg.items():
                nkey = '_'.join(nky.split('_')[:-2])
                if nvl[0] in cvl and 'GEN' in nvl[1]:
                    rclknm = nvl[2]
                    rgrpnm = crgdata[nky]['ClkGrpNm']
                    rfreq = crgdata[nky]['ClkPeriod']
                    rintg = nvl[0]  #crgdata[nky]['OutClkType']
                    rport = crgdata[nky]['SrcPinNm']
                    xclknmlst.append(f'{rclknm}')
                    xclknmdata[f'{rclknm}'] = [f'{rgrpnm}',f'{rfreq}','','','',f'{rport}',f'{rintg}','',f'{nkey}']

        return xclknmlst,xclknmdata

    def set_clkdef_hd(self,cky,cvl,hdclklst,hdclkata,clknmdata):
        xclknmlst = []
        xclknmdata = {}
        if hdclklst:
            for nky in hdclklst:
                sp = nky.split(' ')
                nval = sp[0].split('_')[1]
                nvar = sp[0].split('_')[2]
                if sp[1] in cvl:
                    rcknm = f'{nvar} {sp[2]}'
                    hdt = hdclkata[nky]
                    rmclk = cky
                    ffreq = clknmdata[cky][1]
                    fdiv = clknmdata[cky][3]
                    rmdiv = '1'
                    if ffreq:
                        if '|' in ffreq:
                            for x in range(1,len(ffreq.split('|'))):
                                rmdiv += '|1'
                    elif fdiv:
                        if '|' in fdiv:
                            for x in range(1,len(fdiv.split('|'))):
                                rmdiv += '|1'
                    xclknmlst.append(f'{rcknm}')
                    xclknmdata[f'{rcknm}'] = [f'{hdt[0]}',f'{hdt[1]}','',f'{rmdiv}',f'{rmclk}',f'{hdt[5]}',f'{hdt[6]}',f'{hdt[7]}',f'{hdt[8]}']
        else:
            sdc_info(f'Not found connection from clknm "{cky}" with clkintg "{cvl}" of clkdef to hd')
        
        return xclknmlst,xclknmdata

    def set_clkdef_crgip(self,cky,cvl,crgin_ctype,crgdata,clknmdata):
        xclknmlst = []
        xclknmdata = {}
        if crgin_ctype:
            for nky,nvl in crgin_ctype.items():
                nkey = '_'.join(nky.split('_')[:-2])
                if nvl[0] in cvl:
                    rcknm = nvl[1]
                    rgrpnm = crgdata[nky]['ClkGrpNm']
                    rport = crgdata[nky]['SrcPinNm']
                    rmclk = cky
                    ffreq = clknmdata[cky][1]
                    fdiv = clknmdata[cky][3]
                    rmdiv = '1'
                    if ffreq:
                        if '|' in ffreq:
                            for x in range(1,len(ffreq.split('|'))):
                                rmdiv += '|1'
                    elif fdiv:
                        if '|' in fdiv:
                            for x in range(1,len(fdiv.split('|'))):
                                rmdiv += '|1'
                    xclknmlst.append(f'{rcknm}')
                    xclknmdata[f'{rcknm}'] = [f'{rgrpnm}','','',f'{rmdiv}',f'{rmclk}',f'{rport}','','',f'{nkey}']
        else:
            sdc_info(f'Not found connection from clknm "{cky}" with clkintg "{cvl}" of clkdef to crgin')
        
        #print('set_clkdef_crgip:',cvl,xclknmdata)
        return xclknmlst,xclknmdata


    def get_data_from_json_intg(self,blk,fname,mode='full'):
        jdata = {}
        cblk = self._hiertree.get_block_by_name(blk)
        #bals = cblk.alias
        if self._hiertree.proj:
            hdir = cblk.constr_dir + f'sdcgen/json'
        else:                   
            hdir = self._sdcdir + f'/../../{blk}/sdcgen/json'  

        if not os.path.exists(hdir):
            sdc_warn(f'Missing directory {hdir} for intg check.')
        else:
            if mode == 'full':
                json_file = f'{hdir}/{fname}'
                if os.path.exists(json_file):
                    jdata = self.read_json(json_file)                  
                else:
                    sdc_warn(f'Missing {fname} file of {blk}')
            if mode == 'semi':
                hfiles = os.listdir(hdir)
                hflst = [x for x in hfiles if x.endswith(f'{fname}')]
                if hflst:
                    for hf in hflst:
                        json_file = f'{hdir}/{hf}'
                        if os.path.exists(json_file): 
                            jdata.update(self.read_json(json_file))
                        #print(f'SDC_INFO:Empty subblk clkport json file of {blk}')           
                else:
                    sdc_info(f'Missing {fname} file of {blk}')

        #print('get_data_from_json_intg:',blk,jdata)
        return jdata
    
    # ClkNm	ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment
    def get_clkdata_from_clkdef_intg(self,blk,alias,aval,clkdata):
        clknmdata = {}
        clknmlst = []

        ncrg = {x:x.split('Row')[-1] for x,y in clkdata.items()}
        xcrg = sorted(ncrg.items(), key = lambda x:int(x[1]))
        clst = [k for k,_ in xcrg]
        xclknmlst = [clkdata[k]['ClkNm'] for k in clst]
        clknmlst = [f'{alias} {aval}_{x}' for x in xclknmlst]
        
        for key,clkrow in clkdata.items():
            kwlst = ['ClkGrp','Freq','WaveForm','DivEdge','MstClk',	'PortPin','ClkIntg','Vol','Comment']
            vallst = []

            for kw in kwlst:
                #vallst.append(clkrow[kw])
                if kw == 'MstClk':
                    mclk = clkrow['MstClk']                   
                    if mclk:
                        # if ' ' in mclk.strip():
                        #     vallst.append(mclk.strip())
                        # else:
                        #     vallst.append(f'{alias} {aval}_{mclk.strip()}')
                        if mclk in xclknmlst:
                            vallst.append(f'{alias} {aval}_{mclk}')
                        else:
                            #eval = mclk.split('_')[0]
                            sp = mclk.split('_')
                            if 'NAME_' in mclk:
                                eval = sp[1]
                            else:
                                eval = sp[0]
                            evar = self.get_als_var(blk,eval)
                            vallst.append(f'{evar} {mclk}')
                    else:
                        vallst.append(mclk)
                else:
                    vallst.append(clkrow[kw])

            clknm = clkrow['ClkNm']
            clknmdata[f'{alias} {aval}_{clknm}'] = vallst           
            #clknmlst.append(f'{alias} {aval}_{clknm}')
        
        # print('get_clkdata_from_clkdef_intg:clknmlst',clknmlst)
        #print('get_clkdata_from_clkdef_intg:clknmdata',clknmdata)
        
        return clknmlst,clknmdata                

    def get_clkgrp_from_clkdef_intg(self,blk,clknmlst,clknmdata):
        gpat = [val[0] for val in clknmdata.values()]
        npat = list(set(gpat))

        clkgrp = {}
        inclklst = []
        outclklst = []
        fvdata = self.get_data_from_json_intg(blk,'vfile.json','full')
        for grp in npat:
            grplst = []
            for clknm in clknmlst:
                #print('get_clkgrp_from_clkdef_intg:',clknm)
                # als = clknm.split(' ')[0]
                # clknmg = clknm.split(' ')[1]              
                portpin = clknmdata[clknm][5].strip()
                if not portpin:
                    continue
                if portpin and  portpin in fvdata.keys():
                    portdir = fvdata[portpin][0]
                    if portdir == 'input' and not clknm in inclklst:
                        inclklst.append(clknm)
                        #continue
                    if portdir == 'output' and not clknm in outclklst:
                        outclklst.append(clknm)
                if grp == clknmdata[clknm][0]:
                    grplst.append(clknm)
            if grplst:
                grpnm = grplst[0]
                clkgrp[grpnm] = grplst
                # if grpnm  in inclklst:
                #     #clkgrp[f'{als} {grpnm}'] = grplst[1:]
                #     clkgrp[grpnm] = grplst[1:]
                # else:
                #     #clkgrp[f'{als} {grpnm}'] = grplst
                #     clkgrp[grpnm] = grplst

        return clkgrp,inclklst,outclklst


    # {'NAME_clk_pll_gen': ['clk_pll_sgt', 'NAME_clk_pll_gen'], 
    # 'NAME_clk_mcu_gen': ['clk_mcu_spg', 'NAME_clk_mcu_gen'], 
    # 'NAME_clk_jpg_gen': ['clk_jpeg_ast', 'NAME_clk_jpg_gen'], 
    # 'NAME_clk_jsp_gen': ['clk_jpeg_ast', 'NAME_clk_jsp_gen'], 
    # 'clk_mcu_gpt': ['clk_mcu_spg', 'clk_mcu_gpt'], 'clk_jpeg_hit': ['clk_jpeg_ast', 'clk_jpeg_hit'], 
    # 'clk_jpg_weq': ['clk_jpeg_ast', 'clk_jpeg_hit', 'clk_jpg_weq'], 
    # 'clk_jpg_gen_out': ['NAME_clk_jpg_out', 'clk_jpg_gen_out'], 
    # 'clk_jsp_gen': ['NAME_clk_jpg_out', 'clk_jsp_gen'],
    # 'clk_jsp_out_gen_out': ['NAME_clk_jpg_out', 'clk_jsp_gen', 'clk_jsp_out_gen_out']}
    def get_genclk_lines_by_name(self,tclklst,tclkdata,kw='json',mode='local'):
        genclk_lines = {}
        genline_clks = []

        if tclklst:
            for clknm in tclklst:
                if tclkdata[clknm][3] and tclkdata[clknm][4]:
                    genclk_lines[clknm] = self.get_srcclk(tclkdata,clknm,srclst=[])
                    #genline_clks.extend(genclk_lines[clknm]) 
                    gclktmp = [x for x in genclk_lines[clknm] if x in tclklst]
                    genclk_lines[clknm] = gclktmp
                    genline_clks.extend(gclktmp)

            diff_genclks = list(set(tclklst)^set(genline_clks))
            #print('diff_genclks++++++++++++++++++:',diff_genclks)
            if diff_genclks:
                sdc_warn(f'Must check clkgroup with single clk: {diff_genclks}. Maybe unconnected or input created clk.')
                for x in diff_genclks:
                    if not ' ' in x and x in self._clknmlst:
                        genclk_lines[x] = [x]
            #print('get_genclk_lines_by_name++++++++++++++:',tclkdata,genclk_lines)

        if kw == 'json':
            self._data = genclk_lines
            json_file = self._sdcdir + '/json' + f'/{self._alias.lower()}_genclk_lines.json'
            self.write_json(json_file)

        return genclk_lines

    # 'flt' with netlist hd,'bbx' with bbx hd, 'etm' with lib hd
    def concat_curhd_crgiphd_connect(self,itype='bbx'):
        tclkdata = {}
        tclklst = []
        crgipdata = {}
        if self._iptcrgdata:
            crgipdata.update(self._iptcrgdata)
        if self._iptipdata:
            crgipdata.update(self._iptipdata)        

#################################################################  
# clkdef <-> crgip      
        #{'MCUJPEG_MCUCRG1_MCRG': {'CRGIN_clk_npu': ['MCUCRG1_NAME_clk_npu_gen', 'MCUCRG1_HIER_clk_npu_gen', 'MCUCRG1_NAME_clk_npu_gen', 'None', 'None', 'MCUCRG1'], 'CRGIN_clk_gpu': []}
        crgipdata_chg = {}
        # 'MCUCRG1_CRGIN clk_mcu': []
        if crgipdata:
            ## als: 'MCUJPEG_MCUCRG1(val)_MCRG(var)'
            for cals,cvat in crgipdata.items():
                cval = cals.split('_')[1]
                cvar = cals.split('_')[2]
                for ky,vl in cvat.items():
                    # need support multi crg/ip(MIM) in same hd using als value at future??
                    # current using alias for single crg/ip                   
                    kw = ky.split('_')[0]
                    npt = '_'.join(ky.split('_')[1:])
                    cals = f'{cval}_{kw} {npt} {cvar}'
                    crgipdata_chg[cals] = vl
            #print('crgipdata_chg:',crgipdata_chg)

        if crgipdata_chg:
            for clknm in self._clknmlst:
                clkintg = self._clknmdata[clknm][6]
                if clkintg:                     
                    for ckyt in crgipdata_chg.keys():
                        val = crgipdata_chg[ckyt]
                        ovar = ckyt.split(' ')[-1]
                        cky = ' '.join(ckyt.split(' ')[:-1])

                        #print('clkintg:',clkintg,'||cky:',cky)
                        ### ********************************* ##
                        ## CRGIP NAMING in flow: 'MCUCRG1 NAME_clk_jpg_gen'
                        ## MstClk: 'NAME_clk_jpg_gen' for user, but flow convert 'MCUCRG1 NAME_clk_jpg_gen'
                        ### ********************************* ##
                        # 'MCRG MCUCRG1_NAME_clk_mcu'
                        nky = f'{ovar} {val[0]}'
                        if cky.replace(' ','') in clkintg.replace(' ',''):
                            if re.search(r'CRGIN|IPIN',cky):
                                divedge,mstclk = self.get_divmst_val(clknm)
                                #print('divedge,mstclk:',divedge,mstclk)
                            if re.search(r'CRGOUT|IPOUT',cky):
                                divedge = ''
                                mstclk = ''

                            #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment                       
                            if not nky in tclklst:
                                tclkdata[nky] = [f'{val[2]}',f'{val[4]}','',f'{divedge}',f'{mstclk}','',f'{cky}','',f'{val[3]}']                        
                                tclklst.append(nky)

                        # if '&' in clkintg:
                        #     ncintg = clkintg.split('&')                  
                        #     if cky.replace(' ','') in [x.replace(' ','') for x in ncintg]:
                        #         if re.search(r'CRGIN|IPIN',cky):
                        #             divedge,mstclk = self.get_divmst_val(clknm)
                        #             #print('divedge,mstclk:',divedge,mstclk)
                        #         if re.search(r'CRGOUT|IPOUT',cky):
                        #             divedge = ''
                        #             mstclk = ''

                        #         #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment                       
                        #         if not nky in tclklst:
                        #             tclkdata[nky] = [f'{val[2]}',f'{val[4]}','',f'{divedge}',f'{mstclk}','',f'{cky}','',f'{val[3]}']                        
                        #             tclklst.append(nky)
                        # else:
                        #     ncintg = clkintg
                        #     if cky.replace(' ','') == ncintg.replace(' ',''):
                        #         if re.search(r'CRGIN|IPIN',cky):
                        #             divedge,mstclk = self.get_divmst_val(clknm)
                        #             #print('divedge,mstclk:',divedge,mstclk)
                        #         if re.search(r'CRGOUT|IPOUT',cky):
                        #             divedge = ''
                        #             mstclk = ''

                        #         #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment                       
                        #         if not nky in tclklst:
                        #             tclkdata[nky] = [f'{val[2]}',f'{val[4]}','',f'{divedge}',f'{mstclk}','',f'{cky}','',f'{val[3]}']                        
                        #             tclklst.append(nky)
                    
#################################################################
# clkdef <-> subhd
        # 'MCUJPEG_JPEG(val)_JPEG(var)':{'JPEG(var) HDIN clk_jpeg clk_jpeg_ast': []}
        #nky = f'{als} {kw} {port} {clknm}'
        #nals = hals + '_' + als + '_' + kals
        curhd_pclksinfo = {}
        if self._curhd_portclksinfo:
            for ky,vl in self._curhd_portclksinfo.items():
                sval = ky.split('_')[1]
                svar = ky.split('_')[2]
                cinfo = {}
                for k,v in vl.items():
                    kx = k.split(' ')
                    cinfo[f'{sval}_{svar} {kx[1]} {kx[2]} {kx[3]}'] = v
                curhd_pclksinfo.update(cinfo)

        if itype == 'flt':           
            if curhd_pclksinfo:
                # print('_curhd_portclksinfo',self._curhd_portclksinfo)
                # print('curhd_pclksinfo',curhd_pclksinfo)

                #'JPEG(val)_JPEG(var) HDIN clk_jpeg clk_jpeg_ast': []
                for clknm in self._clknmlst:
                    clkintg = self._clknmdata[clknm][6]
                    if clkintg:                     
                        for cky in curhd_pclksinfo.keys():
                            #print('clkintg:',clkintg,'cikeys:',list(crgipdata_chg.keys()))
                            val = curhd_pclksinfo[cky]
                            kwd = cky.split(' ')
                            kval = kwd[0].split('_')[0]
                            kvar = kwd[0].split('_')[1]
                            ckyg = f'{kval}_{kwd[1]} {kwd[2]}'

                            ### ********************************* ##
                            ## CRGIP NAMING in flow: 'MCUCRG1 NAME_clk_jpg_gen'
                            ## MstClk: 'NAME_clk_jpg_gen' for user, but flow convert 'MCUCRG1 NAME_clk_jpg_gen'
                            ### ********************************* ##
                            # 'MCUCRG1 clk_mcu'
                            nky = f'{kvar} {kwd[3]}'
                            if ckyg.replace(' ','') in clkintg.replace(' ',''):
                                
                                #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment                       
                                if not nky in tclklst:
                                    if 'HDIN' in ckyg:
                                        divedge,mstclk = self.get_divmst_val(clknm)
                                        #ngrp = f'{kvar} {kwd[3]}'
                                        ngrp = f'{kwd[3]}'
                                        tclkdata[nky] = [f'{ngrp}','','',f'{divedge}',f'{mstclk}',f'{val[5]}',f'{val[6]}',f'{val[7]}',f'{val[8]}']
                                        tclklst.append(nky)
                                    if 'HDOUT' in ckyg:
                                        tclkdata[nky] = val                        
                                        tclklst.append(nky)

                            # if '&' in clkintg:
                            #     ncintg = clkintg.split('&')                  
                            #     if re.search(r'HDIN|HDOUT',ckyg) and ckyg.replace(' ','') in [x.replace(' ','') for x in ncintg]:
                            #         #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment                       
                            #         if not nky in tclklst:
                            #             tclkdata[nky] = val                        
                            #             tclklst.append(nky)
                            # else:
                            #     ncintg = clkintg
                            #     if re.search(r'HDIN|HDOUT',ckyg) and ckyg.replace(' ','') == ncintg.replace(' ',''):
                            #         #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment                       
                            #         if not nky in tclklst:
                            #             tclkdata[nky] = val                        
                            #             tclklst.append(nky)
                

        if itype == 'etm':
            pass

#################################################################
# crgip -> crgiphd
# do not support subhd -> crg/ip
        curhd_cihin = {}
        curhd_cihout = {}
        curhd_outcrgip = {}
        curhd_incrgip = {}
        curhd_outhd = {}
        curhd_inhd = {}

        # if crgipdata_chg:
        #     curhd_cihinfo.update(crgipdata_chg)
        # if curhd_pclksinfo:
        #     curhd_cihinfo.update(curhd_pclksinfo)

        # print('curhd_pclksinfo:',curhd_pclksinfo)

        # ckw:f'{cval}_{kw} {npt} {cvar}'
        # f'{sval}_{svar} {kx[1]} {kx[2]} {kx[3]}'
        if crgipdata_chg:
            curhd_outcrgip = {k:v for k,v in crgipdata_chg.items() if 'OUT' in k.split(' ')[0]}
            curhd_incrgip = {k:v for k,v in crgipdata_chg.items() if 'IN' in k.split(' ')[0]}
        if curhd_incrgip:
            curhd_cihin.update(curhd_incrgip)
        if curhd_outcrgip:
            curhd_cihout.update(curhd_outcrgip)   


        if curhd_pclksinfo:
            curhd_outhd = {k:v for k,v in curhd_pclksinfo.items() if 'OUT' in k.split(' ')[1]}
            curhd_inhd = {k:v for k,v in curhd_pclksinfo.items() if 'IN' in k.split(' ')[1]}       
        if curhd_outhd:
            curhd_cihout.update(curhd_outhd)
        if curhd_inhd:
            curhd_cihin.update(curhd_inhd)

        if curhd_cihout:
            for ckw,cvt in curhd_cihout.items():
                cvar,cval,cknm,ctype,cperd,cgrp = self.parse_patn(ckw,cvt,'drv')
                if ctype:
                    if not cperd:
                        sdc_error(f'{cknm} Not find clk period info.')
                    if curhd_cihin:
                        ncihinfo = {k:v for k,v in curhd_cihin.items() if not cvar in k}
                        # ckw:f'{cval}_{kw} {npt} {cvar}'
                        # nkw:f'{sval}_{svar} {kx[1]} {kx[2]} {kx[3]}'
                        for nkw,nvt in ncihinfo.items():
                            nvar,nval,nknm,ntype,nperd,ngrp = self.parse_patn(nkw,nvt,'lod')
                            if ntype in ctype:
                                mstclk = cknm
                                divedge = '1'
                                if '|' in cperd:
                                    div = ['1' for x in cperd.split('|')]
                                    divedge = '|'.join(div)
                                #divedge,mstclk = self.get_divmst_val(clknm)

                                #ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment                       
                                if not nknm in tclklst:
                                    # if re.search(r'CRGIN|IPIN',nkw):
                                    #     tclkdata[nknm] = [f'{cgrp}',f'{cperd}','',f'{divedge}',f'{mstclk}','',f'{cky}','',f'{val[3]}']                        
                                    #     tclklst.append(nknm)    
                                    if re.search(r'HDIN',nkw):
                                        tclkdata[nknm] = [f'{ngrp}',f'{cperd}','',f'{divedge}',f'{mstclk}',f'{nvt[5]}',f'{nvt[6]}',f'{nvt[7]}',f'{nvt[8]}']                        
                                        tclklst.append(nknm) 
                                    else:
                                        tclkdata[nknm] = [f'{ngrp}',f'{cperd}','',f'{divedge}',f'{mstclk}','',f'{ntype}','','']                        
                                        tclklst.append(nknm)
        #print('tclkdata:',tclkdata)                              

#################################################################
        for cky in curhd_pclksinfo.keys():
            val = curhd_pclksinfo[cky] 
            kwd = cky.split(' ')
            #ckyg = f'{kwd[0]}_{kwd[1]} {kwd[2]}'
            # 'MCUCRG1 clk_mcu'
            kvar = kwd[0].split('_')[1]
            nky = f'{kvar} {kwd[3]}'                   
            if not nky in tclklst:
                sdc_info(f'clkdef_crgiphd_connect: {nky} can not find connection in clkdef.')
                tclkdata[nky] = val                        
                tclklst.append(nky)

        for ckyt in crgipdata_chg.keys():
            #val = crgipdata_chg[cky]
            #oals = cky.strip().split('_')[0]
            val = crgipdata_chg[ckyt]
            ovar = ckyt.split(' ')[-1]
            #cky = ' '.join(ckyt.split(' ')[:1])
            nky = f'{ovar} {val[0]}'            
            if not nky in tclklst:
                sdc_info(f'clkdef_crgiphd_connect: {nky} can not find connection in clkdef.')
                tclkdata[nky] = [f'{val[2]}',f'{val[4]}','','','','','','',f'{val[3]}']                        
                tclklst.append(nky)

        tclklst.extend(self._clknmlst)
        tclkdata.update(self._clknmdata)

        # self._tclklst = tclklst
        # self._tclkdata = tclkdata

        #print('tclkdata:',tclkdata)

        return tclklst,tclkdata
 

    # kw = 'drv'/'lod'
    def parse_patn(self,npat,nvt,kw='drv'):
        cvar = ''
        cval = ''
        cknm = ''
        ctype = ''
        perd = ''
        grp = ''
        # CRG/IP:f'{cval}_{kw} {npt} {cvar}'
        # HD:f'{sval}_{svar} {kx[1]} {kx[2]} {kx[3]}'
        # for crgip driver
        if re.search(r'CRGOUT|IPOUT',npat) and kw == 'drv':
            cvar = npat.split(' ')[-1]
            cval = npat.split(' ')[0].split('_')[0]
            cknm = f'{cvar} {nvt[0]}'           
            ctype = nvt[3].replace('IO','').replace('GEN','').replace('(','').replace(')','')
            perd = nvt[4]
            grp = f'{cvar} {nvt[2]}'

        # for crgip loading
        if re.search(r'CRGIN|IPIN',npat) and kw == 'lod':
            cvar = npat.split(' ')[-1]
            cval = npat.split(' ')[0].split('_')[0]
            cknm = f'{cvar} {nvt[0]}'           
            ctype = ''.join(npat.split(' ')[:-1])
            perd = ''
            #grp = f'{cvar} {nvt[2]}'
            grp = f'{nvt[2]}'

        # for hd loading
        if re.search(r'HDIN',npat) and kw == 'drv':
            pass

        # for hd loading
        if re.search(r'HDIN',npat) and kw == 'lod':
            xp = npat.split(' ')
            cvar = xp[0].split('_')[1]
            cval = xp[0].split('_')[0]
            cknm = f'{cvar} {xp[3]}'           
            ctype = f'{cval}_{xp[1]}{xp[2]}' 
            perd = '' 
            #grp =  f'{cvar} {xp[3]}'  
            grp =  f'{xp[3]}'


        return cvar,cval,cknm,ctype,perd,grp

    def get_divmst_val(self,clknm):
        mstclk = clknm
        divedge = '1'
        if self.is_crtclk(clknm):                               
            freq = self._clknmdata[clknm][1]                               
            if '|' in freq:
                xfreq = freq.split('|')
                for i in range(len(xfreq)-1):
                    divedge += '|1'
        if self.is_genclk(clknm):
            ndiv = self._clknmdata[clknm][3]
            if '|' in ndiv:
                xndiv = ndiv.split('|')
                for i in range(len(xndiv)-1):
                    divedge += '|1'

        return divedge, mstclk

    def chg_reg_name(self,pin):
        spin = ''
        if re.search(r'\/D$|\/CLK$|\/CP$|\/E$|\/Q$|\/CD$|\/CK$|\/\$ClkPin|\/\$DataPin|\/\$\{ClkPin\}|\/\$\{DataPin\}',pin.strip()):
            gpin = pin.strip().split('/')
            if re.search(r'[\d+]',gpin[-2]):
                tpin = gpin[-2].replace(']','_reg_') 
                tpin = tpin.replace('[','_') 
            else:
                tpin = gpin[-2] + '_reg_'
            npin = []
            if gpin[:-2]:
                npin.append('/'.join(gpin[:-2]))
            npin.append(tpin)
            npin.append(gpin[-1])
            spin = '/'.join(npin)
        
        return spin

    # clknm:alias variable
    # MCUJPEG_MCRG_MCUCRG1 -> MCUJPEG_MCRG
    # 'MCUJPEG_MCRG_MCUCRG1_CRG': ['MCUCRG1_NAME_clk_jpg_gen','MCUCRG1_NAME_clk_jsp_gen']
    def get_crgip_clknm_alias(self,mdname):
        cinmals = {}

        # 'MCUCRG1 MCRG_NAME_clk_jpg_gen' | 'MCUCRG1_MCRG_NAME_clk_jpg_gen' | 'MCRG_NAME_clk_jpg_gen'
        crgalsiptval = {}
        crgalsiptval.update(self._crgalsiptval)
        crgalsiptval.update(self._ipalsiptval)
        if crgalsiptval:
            for key,val in crgalsiptval.items():
                sp = key.split('_')
                if sp[1] == sp[2]:
                    nals = key
                else:
                # blk = self._hiertree.get_name_by_alias(mdname,sval)
                # sblk = self._hiertree.get_block_by_name(blk)
                    nals = f'{sp[0]}_{sp[2]}_{sp[1]}'
                clknm = [vl[0] for vl in val]
                cinmals[nals] = clknm

        self._crgipclknmals = cinmals
    
    # 'MCUCRG1 MCRG_NAME_clk_jpg_gen' | 'MCUCRG1_MCRG_NAME_clk_jpg_gen' | 'MCRG_NAME_clk_jpg_gen'
    # from crg/ip clk
    def get_alval_by_clknm(self,mdname,alias,clknm):
        alval = ''
        sals = ''

        #{'MCUJPEG_CRG_MCUCRG1': ['NAME_clk_pll_gen', 'NAME_clk_mcu_gen', 'NAME_clk_jpg_gen', 'NAME_clk_jpg_out'], 
        # 'MCUJPEG_CR8_CR8': ['NAME_clk_jsp_gen', 'NAME_clk_npu_out', 'NAME_clk_gpu_out']}
        if not self._crgipclknmals:
            self.get_crgip_clknm_alias(mdname)

        #print('crgipclknmals',self._crgipclknmals)
        if clknm:
        # _crgipclknmals: 'MCUJPEG_CRG_MCUCRG1': ['NAME_clk_jpg_gen','NAME_clk_jsp_gen']
            if not clknm in self._clknmlst:
                tals = []
                if ' ' in clknm:
                    sals = clknm.strip().split(' ')[0]
                    sclk = clknm.strip().split(' ')[1]
                    tals = [ky for ky,vl in self._crgipclknmals.items() if sclk in vl]
                    if sals == tals[0].split('_')[2]:
                        alval = tals[0].split('_')[1]

                elif '_' in clknm:
                    tals = [ky for ky,vl in self._crgipclknmals.items() if clknm in vl]
                    if tals:
                        print('tal',clknm,tals)
                        if sals == tals[0].split('_')[2]:
                            alval = tals[0].split('_')[1]
                    else:
                        sals = clknm.strip().split('_')[0]
                        rclk = clknm.strip().split('_')[1:]
                        if len(rclk) > 1:
                            nclk = '_'.join(rclk)
                        else:
                            nclk = rclk
                        tals = [ky for ky,vl in self._crgipclknmals.items() if nclk in vl]
                        if tals:
                            #print('tal',nclk,tals)
                            if sals == tals[0].split('_')[2]:
                                alval = tals[0].split('_')[1]
                        else:
                            sdc_error(f'get_alval_by_clknm:Can not find {clknm} in crg/ip.')
            else:
                alval = alias

        return alval

    def get_alval_clknm(self,mdname,alias,clknm):
        als = ''
        cknm = ''
        if clknm:
            als = self.get_alval_by_clknm(mdname,alias,clknm)

            #print('crgipclknmals',self._crgipclknmals)
            #{'MCUJPEG_CRG_MCUCRG1': ['NAME_clk_pll_gen', 'NAME_clk_mcu_gen', 'NAME_clk_jpg_gen', 'NAME_clk_jpg_out'], 
            # 'MCUJPEG_CR8_CR8': ['NAME_clk_jsp_gen', 'NAME_clk_npu_out', 'NAME_clk_gpu_out']}
            if not clknm in self._clknmlst:
                if ' ' in clknm:
                    cknm = clknm.split(' ')[1]

                elif '_' in clknm:
                    tals = [ky for ky,vl in self._crgipclknmals.items() if clknm in vl]
                    if tals:
                        cknm = clknm
                    else:                       
                        #sals = clknm.strip().split('_')[0]
                        rclk = clknm.strip().split('_')[1:]
                        if len(rclk) > 1:
                            nclk = '_'.join(rclk)
                        else:
                            nclk = rclk
                        tals = [ky for ky,vl in self._crgipclknmals.items() if nclk in vl]
                        if tals:
                            #print('tal',nclk,tals)
                            cknm = nclk
                        else:
                            sdc_error(f'get_alval_clknm: Can not find {clknm} in crg/ip.')                   
            else:
                cknm = clknm           
        #nclknm = f'$SDCVAR(NAME,${{{als}}},{cknm})'

        return als,cknm


    # based on current level harden block
    #{'JPEG_JPEG':{'input': ['clk_npu clk_mcu_npu','clk_mcu clk_mcu_spg'],'output': ['clk_jpgx clk_jsp_out_gen_out']}}
    def get_curhd_clkportinfo_intg(self,name):
        portclk_intg = {}
        portclkinfo_intg = {}
        nblk_clkport  = {}
        # hdblksg = self._hiertree.get_hierlvlblks(mdname,outtype='hd')
        # hdblks = [x for x in hdblksg if not x is mdname]
        hblk = self._hiertree.get_block_by_name(name)
        hals = hblk.alias
        hdblks = hblk.get_curhd_by_name()
        if hdblks:
            for sblk in hdblks:
                blk = self._hiertree.get_block_by_name(sblk)
                bals = blk.alias

                if self._hiertree.proj:
                    sblk_file = blk.constr_dir + f'sdcgen/json/{bals.lower()}_hdclkport.json'
                else:                   
                    sblk_file = self._sdcdir + f'/../../{sblk}/sdcgen/json' + f'/{bals.lower()}_hdclkport.json'
                if os.path.exists(sblk_file):
                    sblk_clkport = self.read_json(sblk_file)  
                    if sblk_clkport:                                        
                        ridx = [i for i,ele in enumerate(hblk._cust_insts['instref']) if ele==sblk]           
                        if ridx:
                            for idx in ridx:
                                if hblk._cust_insts['instalias'][idx]:
                                    als = blk.alias + '_' + hblk._cust_insts['instalias'][idx]
                                else:
                                    als = blk.alias + '_' + blk.alias
                                portclk_intg[als] = sblk_clkport[blk.alias]
                    else:
                        sdc_warn(f'Empty {bals.lower()}_hdclkport.json file of {blk}')
                else:
                    sdc_warn(f'Missing {bals.lower()}_hdclkport.json file of {blk}')

                if self._hiertree.proj:
                    cblk_file = blk.constr_dir + f'sdcgen/json/{bals.lower()}_hdclkportinfo.json'
                else:                   
                    cblk_file = self._sdcdir + f'/../../{sblk}/sdcgen/json' + f'/{bals.lower()}_hdclkportinfo.json'
                if os.path.exists(cblk_file):
                    cblk_clkport = self.read_json(cblk_file) 
                    if cblk_clkport:
                        ridx = [i for i,ele in enumerate(hblk._cust_insts['instref']) if ele==sblk]           
                        if ridx:
                            for idx in ridx:
                                if hblk._cust_insts['instalias'][idx]:
                                    als = hblk._cust_insts['instalias'][idx]
                                else:
                                    als = bals
                                #nals = hals + '_' + als
                                for ky,vl in cblk_clkport.items():
                                    # '{self._alias} HDIN {inport} {clknm}'
                                    kals = ky.split(' ')[0]
                                    kw = ky.split(' ')[1]
                                    port = ky.split(' ')[2]
                                    clknm = ky.split(' ')[3]
                                    #nky = f'{als} {kw} {port} {kals}_{clknm}'
                                    nky = f'{kals} {kw} {port} {als}_{clknm}'
                                    #nky = f'{kw}_{port}'
                                    nblk_clkport[nky] = vl
                                    nals = hals + '_' + als + '_' + kals
                                portclkinfo_intg[nals] = nblk_clkport 
                    else:
                        sdc_warn(f'Empty {bals.lower()}_hdclkportinfo.json file of {blk}')                        
                else:
                    sdc_warn(f'Missing {bals.lower()}_hdclkportinfo.json file of {blk}')

        self._curhd_portclks = portclk_intg
        self._curhd_portclksinfo = portclkinfo_intg
        #print('portclk_intg:',portclk_intg)

        #return portclkinfo_intg,portclk_intg



    # {'MCUJPEG':{'input': ['clk_npu clk_mcu_npu','clk_mcu clk_mcu_spg'],'output': ['clk_jpgx clk_jsp_out_gen_out']}}
    def get_hdinout_clkport(self,alias):
        inclklst = []
        outclklst = []
        nportclks = {}
        portclks = {}
        portclksinfo = {}
        if self._clknmlst:
            clkdef_grp = self.get_clkgrp_from_clkdef()
            for clknm in self._clknmlst:
                cd = self._clknmdata[clknm]
                if self.is_inps_crtclk(self._clknmdata,clknm):
                    inport = cd[5]
                    inclklst.append(f'{inport} {clknm}')
                    # ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment   
                    #divedge,mstclk = self.get_divmst_val(clknm)   
                    #grpnm = f'$SDCVAR(NAME,${{{alias}}},{clknm})'
                    portclksinfo[f'{alias} HDIN {inport} {clknm}'] = [f'{cd[0]}',f'{cd[1]}',f'{cd[2]}','','',f'{cd[5]}',f'{cd[6]}',f'{cd[7]}',f'{cd[8]}']
                if self.is_oups_genclk(self._clknmdata,clknm):
                    outport = cd[5]
                    outclklst.append(f'{outport} {clknm}')  
                    # ClkGrp	Freq	WaveForm	DivEdge	MstClk	PortPin	ClkIntg	Vol	Comment 
                    #genclks = self.get_srcclk(self._tclkdata,clknm)
                    #clkdef = self._clknmdata[clknm]
                    # if self.is_genclk(clknm):
                    #     genclk_line = self.get_genclk_lines_by_name(self._mdname,'','')
                    # for gnm,glst in clkdef_grp.items():
                    #     if clknm in glst:
                    #         # if self.is_crgiphd_toutclk(clknm) and gnm == genclk_line[clknm][1]:
                    #         #     gclk = genclk_line[clknm][0].split(' ')[1]
                    #         #     gval = genclk_line[clknm][0].split(' ')[0]
                    #         #     gvar = self.get_als_var(self._mdname,gval)
                    #         #     grpnm = f'$SDCVAR(GRPNM,${{{gvar}}},{gclk})' 
                    #         #print('gnm:',gnm,'_clknmdata:',self._clknmdata) 
                    #         if self._clknmdata[gnm][6]:
                    #             if re.search(r'CRGOUT|IPOUT|HDOUT',self._clknmdata[gnm][6]):
                    #                 mstclk = self._clknmdata[gnm][4]
                    #                 #print('get_hdinout_clkport:mclk:',mstclk)
                    #                 gvar = self.get_als_var(self._mdname,mstclk.split(' ')[0])                                   
                    #                 #gclk = '_'.join(mstclk.split('_')[1:])
                    #                 gclk = mstclk.split('_')[1]
                    #                 grpnm = f'$SDCVAR(GRPNM,${{{gvar}}},{gclk})'
                    #         else:
                    #             grpnm = f'$SDCVAR(NAME,${{{alias}}},{gnm})'
                    gfreq,gdiv = self.cal_genclk_div_freq(clknm)
                    if gfreq:
                        if len(gfreq) == 1:
                            rfreq = gfreq[0]
                        else:
                            rfreq = '|'.join(gfreq)                    
                        portclksinfo[f'{alias} HDOUT {outport} {clknm}'] = [cd[0],f'{rfreq}',f'{cd[2]}',f'{cd[3]}',f'{cd[4]}',f'{cd[5]}',f'{cd[6]}',f'{cd[7]}',f'{cd[8]}']
                    else:
                        sdc_error(f'Missing clk frequency of {clknm}')
            nportclks['input'] = inclklst
            nportclks['output'] = outclklst
            portclks[f'{alias}'] =  nportclks    

        self._hdportclks =  portclks
        self._hdportclksinfo = portclksinfo

    
    def read_json(self,file_path):
        sblk_clk_list = {}
        if os.path.exists(file_path):
            with open(file_path,'r') as fw:
                content = fw.read()
                sblk_clk_list = json.loads(content)

        #print('sblk_clk_list:',sblk_clk_list)
        return sblk_clk_list

    # trace the connection of clks from HD/CRG/IP/MISC_GENCLK by topdown 
    # 'local' for current level, 'full' for flatten level
    def Build_clknetwork_by_name(self,mdname,mode='local'):
        pass

