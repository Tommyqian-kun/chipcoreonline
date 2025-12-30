import sys
import time
import os
import re
import  openpyxl

from openpyxl import worksheet 
from pprint import pprint 
import pandas as pd
from openpyxl.utils import get_column_letter 

#from itertools import chain

import tkinter as tk

from openpyxl.styles import Border, Side, PatternFill, Alignment 
from openpyxl.worksheet.datavalidation import DataValidation

from .baseupf import *

class PStrategySheet(BaseSheet):
    def __init__(self,*args):
        super().__init__(*args)
        self._psdata = {}
        #self._pdname = {}
        self._pmels = {}
        


    def update_sheet(self):
        sheet = self.get_sheet()

        # find PMISO table 
        start_rowg = self.find_sheet(sheet, 'PMISO') 

        supply_kw, supply_vol, supply_vss, supply_data = self.get_supply_infos()

        # PDName	Location	SrcSupply	SinkSupply	DiffSupply	SupplyIn	EnCtrlSens	ClampVal	ApplyPorts	Elements	ExcludeList	NoISO	Comment
        kw_iso = ['self', 'parent','fanout']
        self.add_dropdown(sheet, '"' + ','.join(kw_iso) + '"', [start_rowg + 1, 2], [start_rowg + 5, 2])
        for i in [3,4,6]:
            self.add_dropdown(sheet, '"' + ','.join(supply_kw) + '"', [start_rowg + 1, i], [start_rowg + 5, i])
        kw_iso = ['true', 'false']
        self.add_dropdown(sheet, '"' + ','.join(kw_iso) + '"', [start_rowg + 1, 5], [start_rowg + 5, 5])
        iso_ctl = self._upfdg._vfile_data['ISO_CTRL']
        isoctl = self.get_ctl_sig(iso_ctl)
        #print('ISOER ' + ' '.join(isoctl))
        kw_iso = []
        for i in isoctl:
            kw_iso.append(i + ' high')
            kw_iso.append(i + ' low')
        self.add_dropdown(sheet, '"' + ','.join(kw_iso) + '"', [start_rowg + 1, 7], [start_rowg + 5, 7])
        kw_iso = ['0', '1','latch']
        self.add_dropdown(sheet, '"' + ','.join(kw_iso) + '"', [start_rowg + 1, 8], [start_rowg + 5, 8])
        kw_iso = ['inputs', 'outputs','both']
        self.add_dropdown(sheet, '"' + ','.join(kw_iso) + '"', [start_rowg + 1, 9], [start_rowg + 5, 9]) 

        iso_ele,iso_exd,iso_no = self.get_impl_obj(sheet, start_rowg, 'PMISO') 
        #print(iso_exd)
        if iso_ele:
            self.add_dropdown(sheet, '"' + ','.join(iso_ele) + '"', [start_rowg + 1, 10], [start_rowg + 5, 10])
        if iso_exd:
            self.add_dropdown(sheet, '"' + ','.join(iso_exd) + '"', [start_rowg + 1, 11], [start_rowg + 5, 11])
        if iso_no:
            self.add_dropdown(sheet, '"' + ','.join(iso_no) + '"', [start_rowg + 1, 12], [start_rowg + 5, 12])

        kw_iso = ['ELS_A', 'ELS_B','ELS_C','ELS_D', 'ELS_E', 'force', '-update']
        self.add_dropdown(sheet, '"' + ','.join(kw_iso) + '"', [start_rowg + 1, 13], [start_rowg + 5, 13])

        # PDName	Location	SrcSupply	SinkSupply	SupplyIn SupplyOut Rule	ApplyPorts	Elements	ExcludeList	NoLS	Comment
        # find PMLS table 
        start_rowg = self.find_sheet(sheet, 'PMLS') 
        kw_ls = ['self', 'parent','other','fanout','automatic']
        self.add_dropdown(sheet, '"' + ','.join(kw_ls) + '"', [start_rowg + 1, 2], [start_rowg + 5, 2])
        self.add_dropdown(sheet, '"' + ','.join(supply_kw) + '"', [start_rowg + 1, 3], [start_rowg + 5, 3])
        self.add_dropdown(sheet, '"' + ','.join(supply_kw) + '"', [start_rowg + 1, 4], [start_rowg + 5, 4])  
        self.add_dropdown(sheet, '"' + ','.join(supply_kw) + '"', [start_rowg + 1, 5], [start_rowg + 5, 5])
        self.add_dropdown(sheet, '"' + ','.join(supply_kw) + '"', [start_rowg + 1, 6], [start_rowg + 5, 6])            
        kw_ls = ['low_to_high', 'high_to_low','both']
        self.add_dropdown(sheet, '"' + ','.join(kw_ls) + '"', [start_rowg + 1, 7], [start_rowg + 5, 7])
        kw_ls = ['inputs', 'outputs','both']
        self.add_dropdown(sheet, '"' + ','.join(kw_ls) + '"', [start_rowg + 1, 8], [start_rowg + 5, 8])

        ls_ele,ls_exd,ls_no = self.get_impl_obj(sheet, start_rowg, 'PMLS') 
        if ls_ele:
            self.add_dropdown(sheet, '"' + ','.join(ls_ele) + '"', [start_rowg + 1, 9], [start_rowg + 5, 9])
        if ls_exd:
            self.add_dropdown(sheet, '"' + ','.join(ls_exd) + '"', [start_rowg + 1, 10], [start_rowg + 5, 10])
        if ls_no:
            self.add_dropdown(sheet, '"' + ','.join(ls_no) + '"', [start_rowg + 1, 11], [start_rowg + 5, 11])

        kw_ls = ['ELS_A', 'ELS_B','ELS_C','ELS_D', 'ELS_E', 'force', '-update']
        self.add_dropdown(sheet, '"' + ','.join(kw_ls) + '"', [start_rowg + 1, 12], [start_rowg + 5, 12])

        # PDName	SupplyIn	SupplyOut	EnCtrl	AckResp	OnState	OffState	CtrlAckSupply Comment
        # find PMPSW table 
        start_rowg = self.find_sheet(sheet, 'PMPSW')
        in_psw = []
        out_psw = []
        inpsw = []
        outpsw = []        
        psokw = re.findall(r'PSWRow\d+', ' '.join(self._upfdg._pmfile_data.keys()))
        for i in range(1, len(psokw) + 1):
            inpsw.append(self._upfdg._pmfile_data[f'PSWRow{i}']['InputPower'])
            outpsw.append(self._upfdg._pmfile_data[f'PSWRow{i}']['OutputPower'])
        for i in inpsw:
            for j in supply_kw:
                if re.search(r'_PSW', j):
                    in_psw.append(i + ' ' + j.split('_PSW')[0].strip())
        for i in outpsw:
            for j in supply_kw:
                if re.search(r'_PSW', j):
                    out_psw.append(i + ' ' + j)

        self.add_dropdown(sheet, '"' + ','.join(in_psw) + '"', [start_rowg + 1, 2], [start_rowg + 5, 2])
        self.add_dropdown(sheet, '"' + ','.join(out_psw) + '"', [start_rowg + 1, 3], [start_rowg + 5, 3])
        pso_ctl = []
        pso_ack = []

        psoctl = []
        psoack = []
        psw_ctl,psw_ack = self.get_impl_obj(sheet, start_rowg, 'PMPSW')
        #psoctl = self._upfdg._vfile_data['PSO_CTRL']
        psoctl1 = self.get_ctl_sig(self._upfdg._vfile_data['PSO_CTRL'])
        #psoack = self._upfdg._vfile_data['PSO_ACK']
        psoack1 = self.get_ctl_sig(self._upfdg._vfile_data['PSO_ACK'])
        if psw_ctl:
            psoctl.extend(psoctl1)
            psoctl.extend(psw_ctl)
        else:
            psoctl = psoctl1
        if psw_ack:
            psoack.extend(psoack1)
            psoack.extend(psw_ack)
        else:
            psoack = psoack1

        ctlpin = []
        ackpin = []       
        for i in range(1, len(psokw) + 1):
            ctlpin.append(self._upfdg._pmfile_data[f'PSWRow{i}']['CtrlPin'])
            ackpin.append(self._upfdg._pmfile_data[f'PSWRow{i}']['AckPin'])
        for i in ctlpin:
            for j in psoctl:
                pso_ctl.append(i + ' ' + j)
        for i in ackpin:
            for j in psoack:
                pso_ack.append(i + ' ' + j)       
        self.add_dropdown(sheet, '"' + ','.join(pso_ctl) + '"', [start_rowg + 1, 4], [start_rowg + 5, 4])
        self.add_dropdown(sheet, '"' + ','.join(pso_ack) + '"', [start_rowg + 1, 5], [start_rowg + 5, 5])

        on_st = []
        for i in inpsw:
            for j in psoctl:
                on_st.append('ONST' + ' ' + i + ' ' + j)
        self.add_dropdown(sheet, '"' + ','.join(on_st) + '"', [start_rowg + 1, 6], [start_rowg + 5, 6])
            
        off_st = []
        # ?? ! ~
        for j in psoctl:
            off_st.append('OFFST' + ' ' + j)
        self.add_dropdown(sheet, '"' + ','.join(off_st) + '"', [start_rowg + 1, 7], [start_rowg + 5, 7])  
        self.add_dropdown(sheet, '"' + ','.join(supply_kw) + '"', [start_rowg + 1, 8], [start_rowg + 5, 8])
        self.add_dropdown(sheet, '"-update"', [start_rowg + 1, 9], [start_rowg + 5, 9])    

        # PDName	SupplyIn	SaveCtrl	RestCtrl	Elements	ExcludeList	NoRET	RetRegs	Comment
        # find PMRET table 
        start_rowg = self.find_sheet(sheet, 'PMRET')
        #retsave = ' '.join(self._upfdg._vfile_data['RET_SAVE'])
        retsave1 = self.get_ctl_sig(self._upfdg._vfile_data['RET_SAVE'])
        #retres = ' '.join(self._upfdg._vfile_data['RET_RES'])
        retres1 = self.get_ctl_sig(self._upfdg._vfile_data['RET_RES'])
        # retkw = re.findall(r'RETRow\d+', ' '.join(self._upfdg._pmfile_data.keys()))
        # self._upfdg._pmfile_data[f'RETRow{i}']['SavePin'] + ' | ' + self._upfdg._pmfile_data[f'RETRow{i}']['ResPin']
        # for i in range(1, len(retkw) + 1)
        self.add_dropdown(sheet, '"' + ','.join(supply_kw) + '"', [start_rowg + 1, 2], [start_rowg + 5, 2])

        retsave = []
        retres = []
        save_ret,res_ret,ele_ret,exd_ret,no_ret = self.get_impl_obj(sheet, start_rowg, 'PMRET')

        if  save_ret:
            retsave.extend(retsave1)
            retsave.extend(save_ret)
        else:
            retsave = retsave1
        if  res_ret:
            retres.extend(retres1)
            retres.extend(res_ret)
        else:
            retres = retres1

        ret_save = []
        for i in retsave:
            ret_save.append(i + ' high')
            ret_save.append(i + ' low')
            ret_save.append(i + ' positive')
            ret_save.append(i + ' negtive')
        self.add_dropdown(sheet, '"' + ','.join(ret_save) + '"', [start_rowg + 1, 3], [start_rowg + 5, 3])
        ret_res = []
        for i in retres:
            ret_res.append(i + ' high')
            ret_res.append(i + ' low')
            ret_res.append(i + ' positive')
            ret_res.append(i + ' negtive')
        self.add_dropdown(sheet, '"' + ','.join(ret_res) + '"', [start_rowg + 1, 4], [start_rowg + 5, 4])

        if ele_ret:
            self.add_dropdown(sheet, '"' + ','.join(ele_ret) + '"', [start_rowg + 1, 5], [start_rowg + 5, 5])
        if exd_ret:
            self.add_dropdown(sheet, '"' + ','.join(exd_ret) + '"', [start_rowg + 1, 6], [start_rowg + 5, 6])
        if no_ret:
            self.add_dropdown(sheet, '"' + ','.join(no_ret) + '"', [start_rowg + 1, 7], [start_rowg + 5, 7])
        self.add_dropdown(sheet, '"-update"', [start_rowg + 1, 9], [start_rowg + 5, 9])

        # PDName	SupplyIn	ApplyPorts	Elements	ExcludeList	Comment
        # find PMRPT table 
        start_rowg = self.find_sheet(sheet, 'PMRPT')
        self.add_dropdown(sheet, '"' + ','.join(supply_kw) + '"', [start_rowg + 1, 2], [start_rowg + 5, 2])
        kw_rpt = ['inputs', 'outputs','both']
        self.add_dropdown(sheet, '"' + ','.join(kw_rpt) + '"', [start_rowg + 1, 3], [start_rowg + 5, 3])

        ele_rpt,exd_rpt = self.get_impl_obj(sheet, start_rowg, 'PMRPT')
        if ele_rpt:
            self.add_dropdown(sheet, '"' + ','.join(ele_rpt) + '"', [start_rowg + 1, 4], [start_rowg + 5, 4])
        if exd_rpt:
            self.add_dropdown(sheet, '"' + ','.join(exd_rpt) + '"', [start_rowg + 1, 5], [start_rowg + 5, 5])


    def read_data(self):
        sheet = self.get_sheet()
        self._psdata = self.get_table_contxt(sheet)
        # print('_psdata: ', self._psdata)

    def dump_json(self,json_file):
        self._data = self._psdata
        self.write_json(json_file)


    def change_sheet(self):
        pass

    def write_upf(self,mdname,blkalias,blklvl,upf_file):
        
        sheet = self.get_sheet()

        # mdname = self._upfdg._vfile_data['module_name']
        # blkalias = self._upfdg._hier_tree._blocks[mdname].alias
        # blklvl = self._upfdg._hier_tree._blocks[mdname].hdlevel

        #supply_kw, supply_vol, supply_vss, supply_data = self.get_supply_infos()
        # supply_kw  = supply_kw.extend(supply_vss)
        #pdkeys = list(self._psdata.keys())


        pmpswdict, pmpswkeys= self.get_rows(self._psdata,'PMPSW_Row','PDName','PDName')
        upf_lines = f'''
# ========================================= #
# Create power switch
# ========================================= #
''' 
        upf_lines += self.crt_psw(blkalias,pmpswdict,pmpswkeys)


        pmisodict, pmisokeys= self.get_rows(self._psdata,'PMISO_Row','PDName','PDName')
        upf_lines += f'''
# ========================================= #
# Specify isolation
# ========================================= #
'''    
        upf_lines += self.crt_iso(blkalias,pmisodict,pmisokeys)

        pmlsdict, pmlskeys= self.get_rows(self._psdata,'PMLS_Row','PDName','PDName')
        upf_lines += f'''
# ========================================= #
# Specify level shifter
# ========================================= #
'''    
        upf_lines += self.crt_ls(blkalias,pmlsdict,pmlskeys)


        #pmretdict, pmretkeys= self.get_rows(self._psdata,'PMRET_Row','PDName','PDName')
        upf_lines += f'''
# ========================================= #
# Specify retention
# ========================================= #
'''    
        #upf_lines += self.crt_ret(blkalias,pmretdict,pmretkeys)


        self.save_text(upf_lines,upf_file)

    def crt_iso(self,blkalias,pdict,prows):
        upf_lines = '' 
        kwds = ['PDName','Location','SrcSupply','SinkSupply','DiffSupply','SupplyIn','EnCtrlSens','ClampVal','ApplyPorts','Elements','ExcludeList','NoISO','Comment']
        i = 0

        # support ports, elements
        for prow in prows:
            rowdict = pdict[prow]           
            cell = []
            for kwd in kwds:
                cell.append(rowdict[kwd])
            pdnm,loc,src,sink,diff,spy,ctl,clamp,drct,eles,exd,noiso,cmt = cell
            if diff:    diff=diff.lower()

            if src and sink and diff:
                upf_error(f'{prow} has -sink and -source with diff_suppy together. Please check it.')
            
            if noiso and cmt == 'force':
                upf_error(f'{prow} set force and noiso together. Please check it.')

            # pdsht = self._upfdg._sheets['PDomain']
            pdsht = self._upfdg._wb['PDomain']
            pdname = self.get_pdname(blkalias,pdsht)

            i += 1
            #isonm = pdname[pdnm].split('_')[0] + '_ISO_' + pdname[pdnm].split(r'PD\d_')[1]
            isonm = pdname[pdnm] + f'_ISO_{i}'
            # record els
            if cmt:
                if 'ELS_' in cmt:     self._pmels[f'ISO_{cmt}'] = isonm

            upf_lines += f'''
set_isolation   {isonm}     \\
'''
            if pdnm:    upf_lines += f'\t\t\t\t-domain {pdname[pdnm]} \\\n'
            if eles:    upf_lines += f'\t\t\t\t-elements $UPFVAR({eles},${{{blkalias}}}) \\\n'
            if exd:     upf_lines += f'\t\t\t\t-exclude_elements $UPFVAR({exd},${{{blkalias}}}) \\\n'
            if not diff:
                if src:     upf_lines += f'\t\t\t\t-source SS_${{{blkalias}}}_{src} \\\n'
                if sink:    upf_lines += f'\t\t\t\t-sink SS_${{{blkalias}}}_{sink} \\\n'
            else:
                upf_lines += f'\t\t\t\t-diff_supply_only {diff} \\\n'
            if drct:    upf_lines += f'\t\t\t\t-applies_to {drct} \\\n'
            if spy:     upf_lines += f'\t\t\t\t-isolation_supply SS_${{{blkalias}}}_{spy} \\\n'

            if not noiso:
                if ctl:
                    ctls = self.filter_empty_char(ctl)
                    sig = ctls[0]
                    lev = ctls[1]
                    upf_lines += f'\t\t\t\t-isolation_signal {sig} \\\n'
                    upf_lines += f'\t\t\t\t-isolation_sense {lev} \\\n'
                if clamp:   upf_lines += f'\t\t\t\t-clamp_value {clamp} \\\n'
                if cmt == 'force':  upf_lines += '\t\t\t\t-force_isolation \\\n'
            else:
                upf_lines += '\t\t\t\t-no_isolation \\\n'

            if loc:     upf_lines += f'\t\t\t\t-location {loc} \\\n'       

            time_stamp = time.strftime("%Y%m%d%H%M%S", time.localtime())
            isofmt = self.set_name_style('ISO')
            upf_lines += f'\t\t\t\t-name_prefix {isonm}_{isofmt}_{time_stamp}'

            # use_interface_cell
            if cmt:
                if 'ELS_' not in cmt:
                    implnm = isonm + f'_MAPCELL_{i}'
                    upf_lines += self.useintf_pmcell(cmt,pdname[pdnm],isonm,implnm,'ISOROW')
                else:
                    pass
            else:
                implnm = isonm + f'_MAPCELL_{i}'
                upf_lines += self.useintf_pmcell(cmt, pdname[pdnm], isonm, implnm, 'ISOROW')

        return upf_lines



    def crt_ls(self,blkalias,pdict,prows):
        upf_lines = '' 
        kwds = ['PDName','Location','SrcSupply','SinkSupply','Rule','ApplyPorts','Elements','ExcludeList','NoLS','Comment']
        i = 0

        # support ports, elements
        for prow in prows:
            rowdict = pdict[prow]           
            cell = []
            for kwd in kwds:
                cell.append(rowdict[kwd])
            pdnm,loc,src,sink,rule,drct,eles,exd,nols,cmt = cell
            
            if nols and cmt == 'force':
                upf_error(f'{prow} set force and nols together. Please check it.')

            # pdsht = self._upfdg._sheets['PDomain']
            pdsht = self._upfdg._wb['PDomain']
            pdname = self.get_pdname(blkalias,pdsht)

            i += 1
            #lsnm = pdname[pdnm].split('_')[0] + '_LS_' + pdname[pdnm].split(r'PD\d_')[1]
            lsnm = pdname[pdnm] + f'_LS_{i}'
            # record els
            if cmt:
                if re.search(r'ELS_',cmt):     self._pmels[f'LS_{cmt}'] = lsnm

            upf_lines += f'''
set_level_shifter   {lsnm}     \\
'''

            if pdnm:    upf_lines += f'\t\t\t\t-domain {pdname[pdnm]} \\\n'
            if drct:    upf_lines += f'\t\t\t\t-applies_to {drct} \\\n'           
            if eles:    upf_lines += f'\t\t\t\t-elements $UPFVAR({eles},${{{blkalias}}}) \\\n'
            if exd:     upf_lines += f'\t\t\t\t-exclude_elements $UPFVAR({exd},${{{blkalias}}}) \\\n'
            
            if src:     upf_lines += f'\t\t\t\t-source SS_${{{blkalias}}}_{src} \\\n'
            if sink:    upf_lines += f'\t\t\t\t-sink SS_${{{blkalias}}}_{sink} \\\n'
            # if spin:    upf_lines += f'\t\t\t\t-input_supply SS_${{{blkalias}}}_{spin} \\\n'
            # if spout:    upf_lines += f'\t\t\t\t-output_supply SS_${{{blkalias}}}_{spout} \\\n'

            if not nols:
                if cmt == 'force':  upf_lines  += '-force_shift \\\n'
            else:
                upf_lines += '-no_shift \\\n'

            if loc:     upf_lines += f'\t\t\t\t-location {loc} \\\n'       

            time_stamp = time.strftime("%Y%m%d%H%M%S", time.localtime())
            isofmt = self.set_name_style('LS')
            upf_lines += f'\t\t\t\t-name_prefix {lsnm}_{isofmt}_{time_stamp}'

            if cmt:
                if 'ELS_' in cmt:
                    implnm = lsnm + f'_MAPCELL_{i}'
                    upf_lines += self.useintf_pmcell(cmt, pdname[pdnm], lsnm, implnm, 'ELSROW')
                else:
                    pass
            else:
                implnm = lsnm + f'_MAPCELL_{i}'
                upf_lines += self.useintf_pmcell(cmt, pdname[pdnm], lsnm, implnm, 'LSROW')

        return upf_lines


    def useintf_pmcell(self,cmt,pdnm,stnm,implnm,kw):
        # use_interface_cell
        upf_lines = ''
        if kw == 'ISOROW':
            # pmcells = self._upfdg._pmfile_data
            # pmlscels = self.get_pmcells(pmcells,kw,'CellPatn')
            pmcells = [v['PMCell'] for k, v in self._upfdg._vardefpcell.items() if
                       'PMCELL_Row' in k and v['PMType'] == 'ISO']
        elif kw == 'LSROW':
            # pmcells = self._upfdg._pmfile_data
            # pmlscels = self.get_pmcells(pmcells,kw,'CellPatn')
            pmcells = [v['PMCell'] for k, v in self._upfdg._vardefpcell.items() if
                       'PMCELL_Row' in k and v['PMType'] == 'LS']

        elif kw == 'ELSROW':
            stiso = self._pmels[f'ISO_{cmt}']
            stls = self._pmels[f'LS_{cmt}']
            if stiso and stls:
                implnm = implnm.replace('_LS_','_ELS_')
                stnm = self._pmels[f'ISO_{cmt}'] + ' ' + self._pmels[f'LS_{cmt}']
                if stiso.split('_ISO')[0] == stls.split('_LS')[0]:
                    pdnm = stiso.split('_ISO')[0]
                else:
                    pdnm = ''
                    upf_error(f'{stiso} and {stls} not the same power domain for ELS and missing {stls} pmcell mapping. Please check it.')

            # pmcells = self._upfdg._pmfile_data
            # pmlscels = self.get_pmcells(pmcells,'ELS_ROW','CellPatn')

            pmcells = [v['PMCell'] for k, v in self._upfdg._vardefpcell.items() if
                       'PMCELL_Row' in k and v['PMType'] == 'ELS']

        if pdnm:
            upf_lines += f'''
use_interface_cell  {implnm}    \\
                -strategy     {{{stnm}}}          \\
                -domain       {{{pdnm}}}   \\
                -lib_cells    {{{pmcells[0]}}}
'''            
        
        return upf_lines



    def crt_psw(self,blkalias,pdict,prows):
        upf_lines = '' 
        kwds = ['PDName','SupplyIn','SupplyOut','EnCtrl', 'AckCtrl', 'OnState', 'OffState', 'Comment']
        i = 0

        for prow in prows:
            rowdict = pdict[prow]           
            cell = []
            for kwd in kwds:
                cell.append(rowdict[kwd])
            pdnm,spin,spout,ctlsig,acksig,onst,offst,cmt = cell

            pdsht = self._upfdg._wb['PDomain']
            pdname = self.get_pdname(blkalias,pdsht)

            i += 1
            pswnm = pdname[pdnm] + f'_PSW_{i}'

            upf_lines += f'''
create_power_switch     {pswnm}     \\
'''

            if pdnm:        upf_lines += f'\t\t\t\t-domain {pdname[pdnm]} \\\n'
            
            if spout:
                outport = self.filter_empty_char(spout)[0]
                outnet = self.filter_empty_char(spout)[1]
                if outport and outnet:
                    upf_lines += f'\t\t\t\t-output_supply_port {{{outport} {outnet}}} \\\n'
                    
            if spin:
                inport = self.filter_empty_char(spin)[0]
                innet = self.filter_empty_char(spin)[1]
                if inport  and innet:
                    upf_lines += f'\t\t\t\t-input_supply_port {{{inport} {innet}}} \\\n'
            # if ctlackspy:   pass

            if ctlsig:
                ctlport = self.filter_empty_char(ctlsig)[0]
                ctlnet = self.filter_empty_char(ctlsig)[1]
                if ctlport and ctlnet:
                    upf_lines += f'\t\t\t\t-control_port {{{ctlport} {ctlnet}}} \\'
            
            if acksig:
                signm = self.filter_empty_char(acksig)
                ackport = signm[0]
                acknet = signm[1]
                # if len(acksig.split(' ')) == 3:
                #     ackfunc = self.filter_empty_char(acksig)[2]
                if ackport and acknet:
                    upf_lines += f'\t\t\t\t-ack_port {{{ackport} {acknet} }} \\\n'
                    if len(signm) == 3:
                        ackfunc = signm[2]
                        if ackport and acknet and ackfunc:
                            upf_lines += f'\t\t\t\t-ack_port {{{ackport} {acknet} {{{ackfunc}}}}} \\\n'
            if onst:
                onstr = self.filter_empty_char(onst)
                onstnm = onstr[0]
                inport = onstr[1]
                onfunc = onstr[2]
                if onstnm and inport and onfunc:      
                    upf_lines += f'\t\t\t\t-on_state {{{onstnm} {inport} {{{onfunc}}}}} \\\n'
            
            if offst:
                offstnm = onst.split(' ')[0]
                offfunc = onst.split(' ')[1]
                if offstnm and offfunc:                
                    upf_lines += f'\t\t\t\t-off_state {{{offstnm} {{{offfunc}}}}}\n'                


            #implnm = lsnm + f'_MAPCELL_{i}'
            upf_lines += self.map_pswcell(pdname[pdnm],pswnm)

        return upf_lines

    def filter_empty_char(self, sp):
        return [item for item in sp.split(' ') if item]

    def map_pswcell(self,pdnm,pswnm):
        # map cell
        upf_lines = ''               

        # print('pmcelldata: ', self._upfdg._vardefpcell)
        pmcells = [v['PMCell'] for k,v in self._upfdg._vardefpcell.items() if 'PMCELL_Row' in k and v['PMType'] == 'PSW']
        # pmlscels = self.get_pmcells(pmcells,'PSW')

        if pdnm:
            upf_lines += f'''
map_power_switch    {pswnm}    \\
                    -domain       {{{pdnm}}}   \\
                    -lib_cells    {{{pmcells[0]}}}
''' 
        
        return upf_lines   

    def get_pmcells(self,pmcells,kw,attr):
        pmkeys = [list(pmcells.keys())]
        lskeys = [x for x in pmkeys if re.search(f'{kw}',x)]
        lscells = []
        for x in lskeys:
            lscells.append(pmcells[x][attr])
        pmlscels = '{' + ' '.join(lscells) +'}'

        return pmlscels

    def check_sheet(self):
        pass 






