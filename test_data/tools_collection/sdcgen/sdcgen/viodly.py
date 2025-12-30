import sys
import time
import os
import re

from os.path import dirname, abspath, basename

import openpyxl

from .basesdc import *
from com.base import *
# from .clkdef import *
# from .sdcdg import *


#     def __repr__(self):
#         return f'<{self.__class__.__name__} PortPin={self.PortPin} Direction={self.Direction}>'

class VIODly(object):
    def __init__(self):
        # self._mdname = ''
        self._iodlydata = {}
        self._vardata = {}

    def getiodata(self, vlist, vdata):
        i = 0
        rj = 0
        grp_flag = 0
        ioclknm = ''
        # self._mdname = vdata['moduel_name']
        # print('vlist:', vlist)
        # print('vadata:', vdata)

        for kwd in vlist:
            # if i < len(vlist) + 1:
            #     i += 1
            if 'module_name' not in kwd and 'RelClock' not in kwd:
                if not re.search(r'IDEAL|CASE|FP|ANA|TCLK|DFT', vdata[kwd][2]):
                    rj += 1
                    self._iodlydata[f'TMIODLY_Row{rj}'] = {}
                    iodly_tmp = {}
                    if vdata[kwd][1] != '1':
                        iodly_tmp['PortNm'] = kwd + vdata[kwd][1]
                    else:
                        iodly_tmp['PortNm'] = kwd
                    iodly_tmp['Direction'] = vdata[kwd][0]
                    if re.search(r'FALL', vdata[kwd][2]):
                        iodly_tmp['ClkFall'] = 'Y'
                    else:
                        iodly_tmp['ClkFall'] = ''
                    iodly_tmp['DlyMax'] = 'IO_DLY_MAXA'
                    iodly_tmp['DlyMin'] = 'IO_DLY_MINA'

                    if grp_flag:
                        iodly_tmp['ClkNm'] = ioclknm
                    else:
                        iodly_tmp['ClkNm'] = ''

                    iodly_tmp['Vol'] = ''

                    self._iodlydata[f'TMIODLY_Row{rj}'] = iodly_tmp
                    # rj += 1

            if 'RelClock' in kwd:
                if not grp_flag:
                    grp_flag = 1
                    ioclknm = vdata[kwd]
                else:
                    grp_flag = 0
                    ioclknm = ''


    ######################################################

    def write_sdc(self, mdname, alias, vardata, clkdef, sdc_file):
        # clkdef = self._sdcdg._sheets['ClkDef']
        # cinmals = clkdef.get_crgip_clknm_alias(mdname)
        # clkdata = clkdef.get_table_contxt(self._sdcdg._wb['ClkDef'])
        # clkdef.get_clkdata_by_clkname(clkdata)
        self._vardata = vardata

        # iorows = self._iodlydata.keys()
        iodly_lines = ''

        for key, row in self._iodlydata.items():
            # PortNm	Direction	ClkNm	ClkFall	DlyMax	DlyMin	Vol	Comment
            # print('_iodlydata: ', self._iodlydata)

            nrow = key.split('_')[1]
            if row['PortNm']:
                portnm = row['PortNm']
            else:
                portnm = ''
                sdc_error(f'Missing portnm value of {key}')

            # direction
            if row['Direction'] == 'input':
                iocmd = 'set_input_delay'

            if row['Direction'] == 'output':
                iocmd = 'set_output_delay'

            # clknm
            if row['ClkNm']:
                nclknm = row['ClkNm']
            else:
                nclknm = ''
            if nclknm:
                # als,cknm = clkdef.get_alval_clknm(mdname,alias,nclknm)
                cknm = nclknm
                if nclknm in clkdef._clknmlst:
                    als = alias
                else:
                    # avl = nclknm.split('_')[0]
                    sp = nclknm.split('_')
                    if 'NAME_' in nclknm:
                        avl = sp[1]
                    else:
                        avl = sp[0]
                    als = clkdef.get_als_var(mdname, avl)
                clknm = f'$SDCVAR(NAME,${{{als}}},{cknm})'

            # clkfall
            if row['ClkFall'] == 'Y':
                clkfall = '-clock_fall'
            else:
                clkfall = ''

            # dlymax
            if not row['DlyMax']:
                ndlymax = ''
                sdc_error(f'Missing IO dlymax value of {key}')
            else:
                ndlymax = row['DlyMax']
            if ndlymax:
                dlymax = self.get_dlymaxmin(cknm, als, ndlymax)
            else:
                sdc_warn(f'{nrow}: {portnm} missing DlyMax value')


            # dlymin
            if not row['DlyMin']:
                ndlymin = ''
                sdc_error(f'Missing IO dlymin value of {key}')
            else:
                ndlymin = row['DlyMin']
            if ndlymin:
                dlymin = self.get_dlymaxmin(cknm, als, ndlymin)
            else:
                sdc_warn(f'{nrow}: {portnm} missing DlyMin value')

            if row['Vol']:
                vol = row['Vol']
                # VDD_CORE=TT0P750V
                vlt = vol.split('=')[0].strip()
                val = vol.split('=')[1].strip()

                iodly_lines += f'''
# @IODly_{nrow}: {portnm}
if {{$SDCVAR(DCDC_VL,${{{vlt}}}) == "{val}"}} {{
'''
            else:
                iodly_lines += f'''
# @IODly_{nrow}: {portnm}
'''
            iodly_lines = iodly_lines.rstrip()

            if re.search(r'\w+\[\d+:\d+\]', portnm):
                sig, stn, edn, num = self.get_sig_num(portnm)
                iodly_lines += f'''
    for {{set i {stn}}} {{i <= {edn}}} {{incr i}} {{
        {iocmd} -add_delay -clock [get_clocks {clknm}] {clkfall} -max {dlymax} [get_ports {sig}[i]]
        {iocmd} -add_delay -clock [get_clocks {clknm}] {clkfall} -min {dlymin} [get_ports {sig}[i]]
    }}
'''

            # if re.search(r'\w+[\d+]|\w+',portnm):
            else:
                iodly_lines += f'''
    {iocmd} -add_delay -clock [get_clocks {clknm}] {clkfall} -max {dlymax} [get_ports {portnm}]
    {iocmd} -add_delay -clock [get_clocks {clknm}] {clkfall} -min {dlymin} [get_ports {portnm}]
'''

            if row['Vol']:
                iodly_lines += f'''
}}
'''

        self.save_text(iodly_lines, sdc_file)

    def get_dlymaxmin(self, clknm, alias, ndly):

        if re.search(r'IO_DLY_M', ndly):
            # self.get_dlymaxmin(clknm,alias,str(self._vardata[ndly]))
            fdly = str(self._vardata[ndly])
        else:
            fdly = ndly

        if re.match(r'(-)*0\.\d+#$', fdly):
            return fdly.replace('#', '')

        elif re.match(r'(-)*\[expr \d+\w+\]#', fdly):
            return fdly.replace('#', '')

        elif re.match(r'(-)*0\.0$|0$', fdly):
            return f'0.0'

        elif re.match(r'(-)*0\.\d+$', fdly):
            return f'[expr $SDCVAR(CYCLE,${{{alias}}},{clknm}) * {fdly}]'

        elif re.match(r'(-)*\d+%$', fdly):
            xdly = int(fdly.split('%')[0]) / 100
            return f'[expr $SDCVAR(CYCLE,${{{alias}}},{clknm}) * {xdly}]'

        else:
            return fdly.replace('#', '')

    def get_sig_num(self, portnm):
        sig = ''
        stn = ''
        edn = ''
        num = ''
        iopat = re.findall(r'(\w+)(\[\d+:\d+\])', portnm)
        if iopat:
            sig = iopat[0][0]
            stn, edn, num = self.cal_num(iopat[0][1])

        iopat = re.findall(r'(\w+)(\[\d+:\d+\])(\[\d+:\d+\])', portnm)
        if iopat:
            sig = iopat[0][0]
            stn1, edn1, num1 = self.cal_num(iopat[0][1])
            stn2, edn2, num2 = self.cal_num(iopat[0][2])
            num = str(int(num1) * int(num2) - 1)
            # how to set stn/edn ??
            stn = '0'
            edn = num

        # input wire [3:0][5: 0] dat_up,  ====> dat_up[3:0][5:0]
        # input wire [3:0] datg_up[5: 0][2:0][7:0], ====> datg_up[5:0][2:0][7:0][3:0]

        iopat = re.findall(r'(\w+)(\[\d+:\d+\])(\[\d+:\d+\])(\[\d+:\d+\])', portnm)
        if iopat:
            sig = iopat[0][0]
            stn1, edn1, num1 = self.cal_num(iopat[0][1])
            stn2, edn2, num2 = self.cal_num(iopat[0][2])
            stn3, edn3, num3 = self.cal_num(iopat[0][3])
            num = str(int(num1) * int(num2) * int(num3) - 1)
            # how to set stn/edn ??
            stn = '0'
            edn = num

        iopat = re.findall(r'(\w+)(\[\d+:\d+\])(\[\d+:\d+\])(\[\d+:\d+\])(\[\d+:\d+\])', portnm)
        if iopat:
            sig = iopat[0][0]
            stn1, edn1, num1 = self.cal_num(iopat[0][1])
            stn2, edn2, num2 = self.cal_num(iopat[0][2])
            stn3, edn3, num3 = self.cal_num(iopat[0][3])
            stn4, edn4, num4 = self.cal_num(iopat[0][4])
            num = str(int(num1) * int(num2) * int(num3) * int(num4) - 1)
            # how to set stn/edn ??
            stn = '0'
            edn = num

        return sig, stn, edn, num

    def cal_num(self, npat):
        # [n:m]
        stn = npat.split(':')[1].replace(']', '')
        edn = npat.split(':')[0].replace('[', '')
        num = str(int(edn) - int(stn) + 1)
        return stn, edn, num
        # sig = portnm.split('[')[0]
        # stn = portnm.split('[')[1].split(':')[1].replace(']','')
        # edn = portnm.split('[')[1].split(':')[0]
        # print(sig,stn,edn)
        # num = int(edn) - int(stn) + 1


    def save_text(self, context,file):
        with open(file, 'w') as fw:
            fw.write(context)
