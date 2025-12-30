
import sys
import time
import os
import re

from os.path import dirname, abspath, basename

import  openpyxl

from .basesdc import *
from com.base import *
from .clkdef import *


class IntExpSheet(BaseSheet):
    def __init__(self,*args):
        super().__init__(*args)  
        self._mdname = ''
        self._intexpdata = {}     
        self._hier_tree = self._sdcdg._hier_tree
        #self._clkdef = None #self._sdcdg._sheets['ClkDef']
        self._vardata = self.get_vardef_value(self._sdcdg._wb['VarDef'])

        self._lvl = 'blk'
        self._flt = 'IS_FLAT' 

        
    def update_sheet(self):
        '''
        # only during -dg option
        # addition of block hier tree expanded table from hier yaml
        '''
        sheet = self.get_sheet()

        hiertree = self._sdcdg._hier_tree

        # find TMINTEXP table
        start_rowg = self.find_sheet(sheet, 'TMINTEXP')

        varlist = ['0','1']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,3], [start_rowg + 10,3])
        varlist = ['-setup','-hold','all']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,1], [start_rowg + 10,1])
        varlist = ['-start 2 1','-end 2 1','-start NA 1','-end 2 NA']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,2], [start_rowg + 10,2])

        varlist = ['pin [list ]','clk [list ]']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,5], [start_rowg + 10,5])
        varlist = ['pin [list ]']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,6], [start_rowg + 10,6])
        varlist = ['pin [list ]','clk [list ]']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,7], [start_rowg + 10,7])

        # find TMSTPGATE table
        start_rowg = self.find_sheet(sheet, 'TMSTPGATE')
        varlist = ['clk [list ]']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,1], [start_rowg + 10,1])
        varlist = ['pin [list ]']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,2], [start_rowg + 10,2])
        varlist = ['inst [list ]','pin [list ]']
        self.add_dropdown(sheet, '"' + ','.join(varlist) + '"', [start_rowg + 1,3], [start_rowg + 10,3])


######################################################
    def read_data(self):
        sheet = self.get_sheet()
        self._intexpdata = self.get_table_contxt(sheet)
        
    def check_sheet(self):
        pass
    
    def change_sheet(self):
        pass

    def dump_json(self,json_file):
        self._data = self._intexpdata
        self.write_json(json_file)

######################################################
    def write_sdc(self,sdc_dir):
        sheet = self.get_sheet()

        mdname = self._sdcdg._vfile_data['module_name']
        alias = self._sdcdg._hier_tree._blocks[mdname].alias
        hdlvl = self._sdcdg._hier_tree._blocks[mdname].hdlevel
        pwr = self._sdcdg._hier_tree._blocks[mdname].prime_pwr
        self._mdname = mdname

        if hdlvl == 'sys':
            self._lvl = 'sys'
            self._flt = 'IS_CHIP'
        if hdlvl == 'blk':
            self._lvl = 'blk'
            self._flt = 'IS_FLAT'  

        sdc_file = sdc_dir +  f'{alias.lower()}_intexp.sdc'
        self.write_intexp(mdname,alias,sdc_file,fintg=False)
        sdc_file = sdc_dir +  f'intg/{alias.lower()}_intexp_intg.sdc'
        self.write_intexp(mdname,alias,sdc_file,fintg=True) 

    def write_intexp(self,mdname,alias,sdc_file,fintg=False):
        # clkdata = self.get_table_contxt(self._sdcdg._wb['ClkDef'])
        #self._clkdef.get_clkdata_by_clkname(clkdata)
        #self._clkdef = self._sdcdg._sheets['ClkDef']

        intexp_lines = ''

        #print('_intexpdata',self._intexpdata)
        intfp_rows = {}
        intmcp_rows = {}
        intcase_rows = {}
        intstpgt_rows = {}
        for kw,vl in self._intexpdata.items():
            num = kw.split('Row')[1]
            if re.search(r'TMINTEXP_Row',kw):
                # FP	MCP	CaseVal	CasePin	From	Through	To	Comment                               
                if re.search(r'0|1',str(vl['CaseVal'])):
                    intcase_rows[f'CASE_Row{num}'] = vl
                if vl['FP']:
                    intfp_rows[f'FP_Row{num}'] = vl
                if vl['MCP']:
                    intmcp_rows[f'MCP_Row{num}'] = vl
            
            if re.search(r'TMSTPGATE_Row',kw):
                # StopClk	StopPin	DisClkGating	Comment
                intstpgt_rows[f'STPGATE_Row{num}'] = vl
        #print('intfp_rows:',intfp_rows)
        
        intexp_lines += f'''
################################################
## Internal False Path
################################################
'''
        intexp_lines += self.set_intcmd(intfp_rows,'set_false_path',alias,fintg)

        intexp_lines += f'''
################################################
## Internal Multicycle Path
################################################
'''
        intexp_lines += self.set_intcmd(intmcp_rows,'set_multicycle_path',alias,fintg)

        intexp_lines += f'''
################################################
## Internal Case Setting
################################################
'''
        intexp_lines += self.set_intcmd(intcase_rows,'set_case_analysis',alias,fintg)

        intexp_lines += f'''
################################################
## Internal STP and DisGating
################################################
'''
        intexp_lines += self.set_intcmd(intstpgt_rows,'set_sense',alias,fintg)
        intexp_lines += self.set_intcmd(intstpgt_rows,'set_disable_clock_gating_check',alias,fintg)


        # sub harden blk
        if not fintg:
            blkf = 'intexp'
            intexp_lines += self._hier_tree.set_subblk_intg(mdname,blkf)

        self.save_text(intexp_lines,sdc_file)


    #FP	MCP	CaseVal	CasePin	From	Through	To	Comment
    def set_intcmd(self,intdata,cmd,alias,fintg=False):
        intlines = ''
        for kw,vl in intdata.items():
            rnum = kw.split('Row')[1]
            lvl = self._lvl.upper()
            
            # if 'TMINTEXP' in kw and vl[7]:
            #     cmt = vl[7]
            # elif 'TMSTPGATE' in kw and vl[3]:

            if vl['Comment']:
                cmt = vl['Comment']
            else:
                cmt = 'NA'

            # case
            if cmd == 'set_case_analysis':
                if str(vl['CaseVal']):
                    caseval = vl['CaseVal']
                    rcmd = f'{cmd} {caseval}'
                    intlines += self.set_case(rnum,lvl,alias,vl,rcmd,cmt,fintg)

            # fp
            if cmd == 'set_false_path':
                intlines += self.set_fp_path(rnum,lvl,alias,vl,cmd,cmt,fintg)

            # mcp
            if cmd == 'set_multicycle_path':
                intlines += self.set_mcp_path(rnum,lvl,alias,vl,cmd,cmt,fintg)

            # stop clk
            if cmd == 'set_sense':
                intlines += self.set_clk_sense_gating(rnum,lvl,alias,vl,cmd)

            # disable clk gating
            if cmd == 'set_disable_clock_gating_check':
                intlines += self.set_clk_sense_gating(rnum,lvl,alias,vl,cmd)


        return intlines

    #FP	MCP	CaseVal	CasePin	From	Through	To	Comment
    def set_fp_path(self,rnum,lvl,alias,vl,cmd,cmt,fintg=False):
        # clkdata = self.get_table_contxt(self._sdcdg._wb['ClkDef'])
        # self._clkdef.get_clkdata_by_clkname(clkdata)

        if vl['FP']:
            fp = vl['FP']
        else:
            fp = ''
        if vl['From']:
            frm = vl['From']
        else:
            frm = ''
        if vl['Through']:
            thr = vl['Through']
        else:
            thr = ''
        if vl['To']:     
            to = vl['To']
        else:
            to = ''

        intlines = ''
        if fp == 'all':
            fpval = ' '
        else:
            fpval = f'-{fp} '

        kws = self.set_frthrto_val(alias,lvl,frm,thr,to)
        #psig,pstn,pedn,pnum = self.cal_portpin_num(vl[0])                          

        intlines += f'''
# INTFP Row{rnum}
{cmd}  {fpval} {kws} -comment "{cmt}"
'''               

        return intlines

    def set_mcp_path(self,rnum,lvl,alias,vl,cmd,cmt,fintg=False):
        # clkdata = self.get_table_contxt(self._sdcdg._wb['ClkDef'])
        # self._clkdef.get_clkdata_by_clkname(clkdata)

        if vl['MCP']:
            mcp = vl['MCP'].split(' ')
        else:
            mcp = ''
        if vl['From']:
            frm = vl['From']
        else:
            frm = ''
        if vl['Through']:
            thr = vl['Through']
        else:
            thr = ''
        if vl['To']:     
            to = vl['To']
        else:
            to = ''

        kws = self.set_frthrto_val(alias,lvl,frm,thr,to)
        #psig,pstn,pedn,pnum = self.cal_portpin_num(vl[0]) 

        intlines = ''
        if mcp[1] != 'NA':
            kwsetup = f'-{mcp[0]} -setup {mcp[1]}'
        else:
            kwsetup = ''
        if mcp[2] != 'NA':
            kwhold = f'-{mcp[0]} -hold {mcp[2]}'
        else:
            kwhold = ''

        intlines += f'''
# INTMCP Row{rnum}
'''
        intlines = intlines.rstrip()
        if kwsetup:           
            intlines += f'''
{cmd}  {kwsetup}  {kws} -comment "{cmt}"
'''          
            
        if kwhold:            
            intlines += f'''
{cmd}  {kwhold}  {kws} -comment "{cmt}"
'''   
                       
        return intlines

    def set_case(self,rnum,lvl,alias,vl,cmd,cmt,fintg=False):

        if vl['CaseVal']:
            csval = vl['CaseVal']
        else:
            csval = ''
        if vl['CasePin']:
            cspin = vl['CasePin']
        else:
            cspin = ''

        iolines = ''            

        #thr = None
        #to = None
        #kws = self.get_frthrto_val(self,alias,lvl,cspin,thr,to)
        kws = self.get_frthrto_val(alias,lvl,cspin)
        #kwsg = kws.replace('-from','')

        iolines += f'''
# INTCASE Row{rnum}
{cmd}  {csval}  {kws}
'''          
           
        return  iolines
    
    def set_clk_sense_gating(self,rnum,lvl,alias,vl,cmd):
        # StopClk	StopPin	DisClkGating	Comment
        if vl['StopClk']:
            stopclk = vl['StopClk']
        else:
            stopclk = ''
        
        if vl['StopPin']:
            stoppin = vl['StopPin']
        else:
            stoppin = '' 

        if vl['DisClkGating']:
            discgat = vl['DisClkGating']
        else:
            discgat = ''

        intlines = ''
        
        if stopclk and stoppin and cmd == 'set_sense':
            stpclk = self.get_frthrto_val(alias,lvl,stopclk)
            stppin = self.get_frthrto_val(alias,lvl,stoppin)
            intlines += f'''
# INTCLKSense Row{rnum}
{cmd} -stop_propagation -clocks {stpclk} {stppin}

'''

        if discgat and cmd == 'set_disable_clock_gating_check':           
            clkgate = self.get_frthrto_val(alias,lvl,discgat)
            intlines += f'''
# INTCLKGating Row{rnum}            
{cmd} {clkgate}

'''

        return intlines


    def set_frthrto_val(self,alias,lvl,frm,thr,to):
        kwlines = []
 
        if frm:
            frmvalg = self.get_frthrto_val(alias,lvl,frm)
            frmval = f'-from {frmvalg}'
            kwlines.append(frmval)       
        if thr:
            thrvalg = self.get_frthrto_val(alias,lvl,thr)
            thrval = f'-through {thrvalg}'
            kwlines.append(thrval)
        if to:
            tovalg = self.get_frthrto_val(alias,lvl,to)
            toval = f'-to {tovalg}'
            kwlines.append(toval)
                
        kws = ' '.join(kwlines)

        return kws

    def get_frthrto_val(self,alias,lvl,dval):
        clkdef = self._sdcdg._sheets['ClkDef']
        # clkdata = clkdef.get_table_contxt(self._sdcdg._wb['ClkDef'])
        # self._clkdef.get_clkdata_by_clkname(clkdata)
        rval = []

        sval = dval.strip()
        if re.search(r'\]\]$',sval):
            sval = sval.replace(']]',']').strip().split(' ')
        else:
            sval = sval.strip(']').strip().split(' ')
        if sval[0] == 'clk':
            rval.append(f'[get_clocks [list ')
            for cknm in sval[2:]:
                if cknm:                        
                    #als,ncknm = clkdef.get_alval_clknm(self._mdname,alias,cknm)
                    if cknm in clkdef._clknmlst:
                        als = alias
                    else:
                        #avl = cknm.split('_')[0]
                        sp = cknm.split('_')
                        if 'NAME_' in cknm:
                            avl = sp[1]
                        else:
                            avl = sp[0]
                        als = clkdef.get_als_var(self._mdname,avl)
                    rval.append(f'$SDCVAR(NAME,${{{als}}},{cknm})')
            rval.append(f']]')

        if sval[0] == 'inst':
            rval.append(f'[get_cells [list ')
            for cell in sval[2:]:
                if re.search(r'\w+\[\d+:\d+\]',cell.strip()):
                    #ncell = cell.strip().replace(']','').strip()
                    #spin = self.name_chg(npin)
                    sig,stn,edn,num = self.get_sig_num(cell.strip())
                    for i in range(int(stn),int(edn)+1):
                        rval.append(f'$SDCVAR(HIER,{lvl},${{{alias}}}){sig}[{i}]')
                else:
                    rval.append(f'$SDCVAR(HIER,{lvl},${{{alias}}}){cell.strip()}')
            rval.append(f']]')

        if sval[0] == 'pin':
            rval.append(f'[get_pins [list ')
            for pin in sval[2:]:
                # if re.search(r'[\d+]\s*]$',pin.strip()):
                #     npin = pin.strip().replace(']','').strip()
                #     #spin = self.name_chg(npin)
                #     rval.append(f'$SDCVAR(HIER,${lvl},${{{alias}}}){npin} ')
                if re.search(r'\w+\[\d+:\d+\]$',pin.strip()):
                    mpins = self.get_mbit_chg(pin.strip())
                    for mpin in mpins:
                        #spin = self.name_chg(mpin)
                        rval.append(f'$SDCVAR(HIER,${lvl},${{{alias}}}){mpin} ')
                elif re.search(r'\/D$|\/CLK$|\/CP$|\/E$|\/Q$|\/CD$|\/CK$|\/\$ClkPin|\/\$DataPin|\/\$\{ClkPin\}|\/\$\{DataPin\}',pin.strip()):
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
                    rval.append(f'$SDCVAR(HIER,{lvl},${{{alias}}}){spin}')
                else:
                    npin = pin.strip()
                    #spin = self.name_chg(npin)
                    rval.append(f'$SDCVAR(HIER,{lvl},${{{alias}}}){npin}')
            rval.append(f']]')

        pval = ' '.join(rval)

        return pval
    
    
    def get_mbit_chg(self,portpin):
        mportpins = []
        sig,stn,edn,num = self.get_sig_num(portpin)
        for i in range(int(stn),int(num)+1):
            mportpins.append(f'{sig}[{i}]')

        return mportpins
    

    def get_sig_num(self,portnm):
        sig = ''
        stn = ''
        edn = ''
        num = ''
        iopat = re.findall(r'(\S+)(\[\d+:\d+\])',portnm)
        if iopat:
            sig = iopat[0][0]
            stn,edn,num = self.cal_num(iopat[0][1])

        iopat = re.findall(r'(\S+)(\[\d+:\d+\])(\[\d+:\d+\])',portnm)
        if iopat:
            sig = iopat[0][0]
            stn1,edn1,num1 = self.cal_num(iopat[0][1])
            stn2,edn2,num2 = self.cal_num(iopat[0][2])
            num = str(int(num1) * int(num2) -1)
            # how to set stn/edn ??
            stn = '0'
            edn = num

        #input wire [3:0][5: 0] dat_up,  ====> dat_up[3:0][5:0]
        #input wire [3:0] datg_up[5: 0][2:0][7:0], ====> datg_up[5:0][2:0][7:0][3:0]

        iopat = re.findall(r'(\S+)(\[\d+:\d+\])(\[\d+:\d+\])(\[\d+:\d+\])',portnm)
        if iopat:
            sig = iopat[0][0]
            stn1,edn1,num1 = self.cal_num(iopat[0][1])
            stn2,edn2,num2 = self.cal_num(iopat[0][2])
            stn3,edn3,num3 = self.cal_num(iopat[0][3])
            num = str(int(num1) * int(num2) * int(num3) -1)
            # how to set stn/edn ??
            stn = '0'
            edn = num        

        iopat = re.findall(r'(\S+)(\[\d+:\d+\])(\[\d+:\d+\])(\[\d+:\d+\])(\[\d+:\d+\])',portnm)
        if iopat:
            sig = iopat[0][0]
            stn1,edn1,num1 = self.cal_num(iopat[0][1])
            stn2,edn2,num2 = self.cal_num(iopat[0][2])
            stn3,edn3,num3 = self.cal_num(iopat[0][3])
            stn4,edn4,num4 = self.cal_num(iopat[0][4])
            num = str(int(num1) * int(num2) * int(num3) * int(num4) -1)
            # how to set stn/edn ??
            stn = '0'
            edn = num
        
        return sig,stn,edn,num

    def cal_num(self,npat):
        #[n:m]
        stn = npat.split(':')[1].replace(']','')
        edn = npat.split(':')[0].replace('[','')
        num = str(int(edn) - int(stn) + 1)
        return stn,edn,num

