
import os,sys
import yaml
import re


import  openpyxl
from openpyxl.worksheet.datavalidation import DataValidation
from collections import Counter

from .base import *

# Define some attributes and various methods for every block in hier tree
class BaseBlock():
    def __init__(self,name):
        self._name = name
        self._alias = ''
        self._hdlevel = 'blk'
        self._prime_pwr = ''
        self._constr_dir = ''
        self._insts = []
        self._mac_insts = []
        self._dig_insts = []
        self._cust_insts = {}
        self._proj = False

    def __repr__(self):
        return '<%s name=%s alias=%s>' % (self.__class__.__name__, self._name, self._alias)

    @property 
    def hdlevel(self):
        return self._hdlevel

    @hdlevel.setter
    def hdlevel(self, level):
        supported_lvs = ('top', 'sys', 'blk', 'soft', 'lib', 'crg', 'pll')
        if level not in supported_lvs:
            sdc_error(f'Unsupported HDLEVEL {level} of block {self._name}, should be one of {supported_lvs}')
            return
        else:
            if level == 'sys' or level == 'top':
                self._hdlevel = 'sys'
            else:
                self._hdlevel = level

    @property
    def lvl_flat(self):
        if self._hdlevel == 'sys':
            return 'IS_CHIP'
        else:
            return 'IS_FLAT'
        
    @property
    def alias(self):
        return self._alias

    @alias.setter
    def alias(self, alias):
        self._alias = alias

    @property
    def prime_pwr(self):
        return self._prime_pwr

    @prime_pwr.setter
    def prime_pwr(self, pwr):
        self._prime_pwr = pwr

    @property
    def insts(self):
        return self._insts

    @insts.setter
    def insts(self, insts):
        self._insts = insts

    @property
    def mac_insts(self):
        return self._mac_insts

    @mac_insts.setter
    def mac_insts(self, mac_insts):
        self._mac_insts = mac_insts

    @property
    def dig_insts(self):
        return self._dig_insts

    @dig_insts.setter
    def dig_insts(self, dig_insts):
        self._dig_insts = dig_insts

    @property
    def constr_dir(self):
        return self._constr_dir
    
    @constr_dir.setter
    def constr_dir(self, consdir):
        self._constr_dir = consdir

    @property
    def proj(self):
        return self._proj

    @proj.setter
    def proj(self, proj):
        self._proj = proj

    def get_curcust_by_name(self, inst_type,flg=''):
        _hier = []
        _ref = []
        #_lvl = []
        _alias = []
        _pwr = []
        _usersdc = []
        if inst_type == 'insts' and self.insts:
            for i in range(0,len(self.insts)):
                finst = self.insts[i].split(',')
                if len(finst) == 3:
                    _hier.append(finst[0].strip())
                    _ref.append(finst[1].strip())
                    _alias.append(None)
                    _pwr.append(finst[2].strip())
                    _usersdc.append(None)
                if len(finst) == 4:
                    _hier.append(finst[0].strip())
                    _ref.append(finst[1].strip())
                    if not flg:
                        _alias.append(finst[2].strip().replace('#',''))
                    else:
                        _alias.append(finst[2].strip())
                    _pwr.append(finst[3].strip())
                    _usersdc.append(None)
            self._cust_insts['insthier'] = _hier
            self._cust_insts['instref'] = _ref
            self._cust_insts['instalias'] = _alias
            self._cust_insts['instpwr'] = _pwr
            self._cust_insts['instuser'] = _usersdc
        
        if inst_type == 'mac_insts' and self.mac_insts:
            for i in range(0,len(self.mac_insts)):
                if isinstance(self.mac_insts[i],str):
                    fmac = self.mac_insts[i].split(',')  
                    if len(fmac) == 3:
                        _hier.append(fmac[0].strip())
                        _ref.append(fmac[1].strip())
                        _alias.append(None)
                        _pwr.append(fmac[2].strip())
                        _usersdc.append(None)
                    if len(fmac) == 4:
                        _hier.append(fmac[0].strip())
                        _ref.append(fmac[1].strip())
                        if not flg:
                            _alias.append(fmac[2].strip().replace('#',''))
                        else:
                            _alias.append(fmac[2].strip())
                        _pwr.append(fmac[3].strip())
                        _usersdc.append(None)
                if isinstance(self.mac_insts[i],dict):
                    fmac = ''.join(self.mac_insts[i].keys()).split(',')
                    _hier.append(fmac[0].strip())
                    _ref.append(fmac[1].strip()) # + '_USR' )
                    _alias.append(None)
                    _pwr.append(fmac[2].strip())
                    _usersdc.append(''.join(self.mac_insts[i].values()))  
            self._cust_insts['machier'] = _hier
            self._cust_insts['macref'] = _ref
            self._cust_insts['macalias'] = _alias
            self._cust_insts['macpwr'] = _pwr
            self._cust_insts['macuser'] = _usersdc

        if inst_type == 'dig_insts' and self.dig_insts:
            for i in range(0,len(self.dig_insts)):
                if isinstance(self.dig_insts[i],str):
                    fdig = self.dig_insts[i].split(',')  
                    if len(fdig) == 3:
                        _hier.append(fdig[0].strip())
                        _ref.append(fdig[1].strip())
                        _alias.append(None)
                        _pwr.append(fdig[2].strip())
                        _usersdc.append(None)
                    if len(fdig) == 4:
                        _hier.append(fdig[0].strip())
                        _ref.append(fdig[1].strip())
                        if not flg:
                            _alias.append(fdig[2].strip().replace('#',''))
                        else:
                            _alias.append(fdig[2].strip())
                        _pwr.append(fdig[3].strip())
                        _usersdc.append(None)
                if isinstance(self.dig_insts[i],dict):
                    fdig = ''.join(self.dig_insts[i].keys()).split(',')
                    _hier.append(fdig[0].strip())
                    _ref.append(fdig[1].strip()) # + '_USR')
                    _alias.append(None)
                    _pwr.append(fdig[2].strip())
                    _usersdc.append(''.join(self.dig_insts[i].values()))
            self._cust_insts['dighier'] = _hier
            self._cust_insts['digref'] = _ref
            self._cust_insts['digalias'] = _alias
            self._cust_insts['digpwr'] = _pwr
            self._cust_insts['diguser'] = _usersdc       

        return self._cust_insts

    def get_curhd_by_name(self):
        #return self.name.split() + self._cust_insts['instref']
        self.get_curcust_by_name('insts')
        if 'instref' in self._cust_insts:
            return self._cust_insts['instref']

    def get_curmac_by_name(self,flg=''):
        self.get_curcust_by_name('mac_insts',flg)
        if 'macref' in self._cust_insts:
            return self._cust_insts['macref']

    def get_curdig_by_name(self,flg=''):
        self.get_curcust_by_name('dig_insts',flg)
        if 'digref' in self._cust_insts:
            return self._cust_insts['digref']
    
    def get_curuser_by_name(self, inst_type):
        self.get_curcust_by_name('mac_insts')
        self.get_curcust_by_name('dig_insts')
        if inst_type == 'mac_insts' and 'macuser' in self._cust_insts:           
            return self._cust_insts['macuser']       
        elif inst_type == 'dig_insts'and 'diguser' in self._cust_insts:
            return self._cust_insts['diguser']
        else:
            return None



class HierPwrTree():
    def __init__(self,yaml_file):
        self.yaml_file = yaml_file
        self._blocks = {}
        self._primepwr = {}
        self._yaml_data = {}
        self._hierdata = {}
        self._pwrdata = {}
        #self._blktrees = {}
        self.build_hier_tree(yaml_file)
        

    def build_hier_tree(self, yaml_file):

        # get yaml_data
        yaml_data = {}
        if not os.path.exists(yaml_file):
            raise FileExistsError(f'{yaml_file} does not exists')
        with open(yaml_file, 'r') as fh:
            yaml_data = yaml.load(fh, yaml.FullLoader)

        if 'hier' not in yaml_data:
            print('Missing hier keyword in yaml file.')
            upf_fatal(f'Must include keyword <hier>')
        if 'pwr' not in yaml_data:
            print('Missing pwr keyword in yaml file.')
            upf_fatal(f'Must include keyword <pwr>')

        # get '_primepwr'
        for pwr_name in yaml_data['pwr'].keys():
            if yaml_data['pwr'][pwr_name]:
                self._primepwr[pwr_name] = yaml_data['pwr'][pwr_name]   

        for blk_name in yaml_data['hier'].keys():

            self._blocks[blk_name] = BaseBlock(blk_name)

            if 'alias' in yaml_data['hier'][blk_name] and yaml_data['hier'][blk_name]['alias']:
                self._blocks[blk_name].alias = yaml_data['hier'][blk_name]['alias']
            else:
                self._blocks[blk_name].alias = None

            if 'hdlevel' in yaml_data['hier'][blk_name] and yaml_data['hier'][blk_name]['hdlevel']:
                self._blocks[blk_name].hdlevel = yaml_data['hier'][blk_name]['hdlevel']
            else:
                self._blocks[blk_name].hdlevel = None            
            
            if 'prime_pwr' in yaml_data['hier'][blk_name] and yaml_data['hier'][blk_name]['prime_pwr'] in self._primepwr and yaml_data['hier'][blk_name]['prime_pwr']:
                self._blocks[blk_name].prime_pwr = yaml_data['hier'][blk_name]['prime_pwr'] + ' ' + self._primepwr[yaml_data['hier'][blk_name]['prime_pwr']]
            else:
                self._blocks[blk_name].prime_pwr = None 

            if 'constr_dir' in yaml_data['hier'][blk_name] and yaml_data['hier'][blk_name]['constr_dir']:
                self._blocks[blk_name].constr_dir = yaml_data['hier'][blk_name]['constr_dir']
            else:
                self._blocks[blk_name].constr_dir = None

            if 'insts' in yaml_data['hier'][blk_name] and yaml_data['hier'][blk_name]['insts']:
                self._blocks[blk_name].insts = yaml_data['hier'][blk_name]['insts']
            else:
                self._blocks[blk_name].insts = None

            if 'mac_insts' in yaml_data['hier'][blk_name] and yaml_data['hier'][blk_name]['mac_insts']:
                self._blocks[blk_name].mac_insts = yaml_data['hier'][blk_name]['mac_insts']
            else:
                self._blocks[blk_name].mac_insts = None

            if 'dig_insts' in yaml_data['hier'][blk_name] and yaml_data['hier'][blk_name]['dig_insts']:
                self._blocks[blk_name].dig_insts = yaml_data['hier'][blk_name]['dig_insts']
            else:
                self._blocks[blk_name].dig_insts = None

        self._hierdata = yaml_data['hier'] 
        self._pwrdata = yaml_data['pwr']
        self._yaml_data = yaml_data

    def get_block_by_name(self, name) -> BaseBlock:
        if name in self._blocks:
            return self._blocks[name]
        else:
            return None    

    def get_curblks(self,name):
        curblks = []
        
        allblks = list(self._hierdata.keys())
        if name in allblks:
            curblk = self.get_block_by_name(name)

            if curblk.get_curhd_by_name():
                curblks = [x for x in curblk.get_curhd_by_name() if x is not None]
            if curblk.get_curmac_by_name():
                curblks += [x for x in curblk.get_curmac_by_name() if x is not None]
            if curblk.get_curdig_by_name():
                curblks += [x for x in curblk.get_curdig_by_name() if x is not None]  
        else:
            sdc_warn(f'{name} is not expanded in hier_pwr yaml file.')
        
        return  curblks
    
    def get_hiertrees(self, name, blktrees={}, valstyle=None) -> dict:

        curblks = self.get_curblks(name)
        #blktrees = {}
        if curblks:
            new_curblks = [elem.replace('_USR', '') if re.search(r'_USR$',elem) else elem for elem in curblks]
            blktrees[name] = new_curblks
        else:
            if valstyle:
                blktrees[name] = None   

        for blk in curblks:
            if re.search(r'_USR$',blk):
                blk = blk.replace('_USR','')
                sdc_warn(f'{blk} is not expanded in hier_pwr yaml file.')
            elif len(curblks) > 0:
                self.get_hiertrees(blk,blktrees)    
        
        return blktrees

    def get_hierblks(self, name) -> list:

        blktrees = self.get_hiertrees(name)
        result = []
        for key, value in blktrees.items():
            if key not in result:
                result.append(key)
            if isinstance(value, list):
                for element in value:
                    if element not in result:
                        result.append(element)
        return result        

    def get_hierblks_infos(self,name) -> dict:

        blks = self.get_hierblks(name)
        blksinfo = {}

        allblks = list(self._hierdata.keys())
        for val in blks:
            if val in allblks:
                blk = self.get_block_by_name(val)
                alias = blk.alias
                lvl = blk.hdlevel
                condir = blk.constr_dir
                pwr = blk.prime_pwr
                pwrg = pwr.split(' ')[0].strip()
                blksinfo[val] = val + f' {alias}' + f' {lvl}' + f' {pwrg}' + f' {condir}'
            else:
                blksinfo[val] = val + ' (NOT EXPEND)'

        return blksinfo 


    def get_hierlvlblks(self, name, outtype='hd') -> list:
        '''
        get different harden insts, mac insts, dig insts under current design
        outtype is hd/lib/soft/crg/pll
        '''
        allhierblks = []
        allhierblks = self.get_hierblks(name)
        #alltreeblks = self.get_hiertrees(name)
        allhierblks.append(name)

        #allblks = list(self._hierdata.keys())

        insts = []
        macs = []
        digs = []
        plls = []
        crgs = []
        if allhierblks:
            for curblk in allhierblks:
                #if curblk in allblks:
                blk = self.get_block_by_name(curblk)
            
                lvl = blk.hdlevel
                if lvl in ['blk', 'sys', 'top']:
                    insts.append(curblk)
                if lvl in ['lib']:
                    macs.append(curblk)  
                if lvl in ['pll']:
                    plls.append(curblk) 
                if lvl in ['soft']:
                    digs.append(curblk)  
                if lvl in ['crg']:
                    crgs.append(curblk)
                # else:
                #     #print(f'XYZ_{curblk}')
                #     for ky,vl in alltreeblks.items():
                #         if curblk in vl:
                #             parent = ky
                #     blkg = self.get_block_by_name(parent)
                #     if curblk in blkg.get_curhd_by_name():
                #         insts.append(curblk)
                #         sdc_warn(f'{curblk} is harden block need expand it in hier_pwr yaml file.')
                #     if curblk in blkg.get_curmac_by_name() or f'{curblk}_USR' in blkg.get_curmac_by_name():
                #         macs.append(curblk)
                #         sdc_warn(f'{curblk} is macro block, if not user constraint, need expand it in hier_pwr yaml file.')
                #     if curblk in blkg.get_curdig_by_name() or f'{curblk}_USR' in blkg.get_curdig_by_name():
                #         digs.append(curblk)
                #         sdc_warn(f'{curblk} is digital block, if not user constraint, need expand it in hier_pwr yaml file.')

        if outtype == 'hd':
            return insts
        if outtype == 'lib':
            return macs
        if outtype == 'soft':
            return digs  
        if outtype == 'pll':
            return plls
        if outtype == 'crg':
            return crgs  

    def get_hierdepth(self,dic,key):
        
        allblks = list(self._hierdata.keys())
    
        if key not in dic:
            return 1
        else:
            max_depth = 0
            for sub_key in dic[key]:
                if sub_key not in allblks:
                    sdc_warn(f'{sub_key} is not expanded in hier yaml file.')
                else:
                    current_depth = self.get_hierdepth(dic, sub_key) + 1
                    max_depth = max(max_depth, current_depth)
            return max_depth

        # # blktrees = self.get_hiertrees(name)
        # if key not in dic:
        #     return 0
        
        # depths = []
        # for child_key in dic[key]:
        #     if child_key not in allblks:
        #         print(f'{child_key} is not expanded in hier yaml file.')
        #     else:
        #         depths.append(self.get_hierdepth(dic,child_key))
        #         #max_depth = max(max_depth, depth)
        
        # return max(depths) + 1

        # max_depth = depth  # 记录最大深度
        
        # if isinstance(blktrees, dict):
        #     for child_node in blktrees.values():
        #         if child_node not in allblks:
        #             print(f'{child_node} is not expanded in hier yaml file.')
        #     else:
        #         child_depth = self.get_hierdepth(child_node, depth + 1)
        #         max_depth = max(max_depth, child_depth)
        
        # return max_depth

    def get_alias_by_name(self, name):
        return self._blocks[name].alias

    # for clk intg
    def get_alias_order(self,name,als_lst=[]):
        #curblks = self.get_curhd_by_name()
        curblks = self.get_curblks(name)
        if not als_lst:
            als_lst.append(list(self.get_alias_by_name(name)))
        else:
            als_tmp = []
            if len(curblks) > 0:
                for cblk in curblks:
                    blk = self.get_block_by_name(cblk)
                    als_tmp.append(blk.alias)
                als_lst.append(als_tmp)

                for cblk in curblks:
                    self.get_alias_order(cblk,als_lst)
            else:
                sdc_info(f'all alias of {name} is ready.')

        print('alias order:', als_lst)
        return als_lst

    def get_fblk(self,name,blk):
        fblk = []
        hiertrees = self.get_hiertrees(name)
        fblk = [ky for ky,vl in hiertrees.items() if blk in vl]
        if fblk:
            return fblk

    def get_sblk(self,name,blk):
        sblk = []
        hiertrees = self.get_hiertrees(name)
        sblk = [vl for ky,vl in hiertrees.items() if blk in ky]
        if sblk:
            return sblk


    def get_curmim_blks(self,name,type=''):
        allblks = []
        # if type == 'hd':
        #     allblks = self.get_hierlvlblks(name,outtype='hd')
        # elif type == 'lib':
        #     allblks = self.get_hierlvlblks(name,outtype='lib')
        # elif type == 'pll':
        #     allblks = self.get_hierlvlblks(name,outtype='pll')
        # elif type == 'soft':
        #     allblks = self.get_hierlvlblks(name,outtype='soft')
        # elif type == 'crg':
        #     allblks = self.get_hierlvlblks(name,outtype='crg')
        tblk = self.get_block_by_name(name)
        if type == 'inst':
            allblks = tblk.get_curhd_by_name()
        elif type == 'mac':
            allblks = tblk.get_curmac_by_name()
        elif type == 'dig':
            allblks = tblk.get_curdig_by_name()
        else:            
            allblks = self.get_curblks(name)
        #print(allblks)

        mline_blks = []
        sline_blks = []
        if allblks:
            counter = Counter(allblks)
            mline_blks = [ele for ele,cnt in counter.items() if cnt > 1]

            for blk in allblks:
                if not blk in mline_blks:
                    cblk = self.get_block_by_name(blk)
                    if cblk.hdlevel == 'blk' or cblk.hdlevel == 'sys':
                        # curinst = cblk.get_curhd_by_name()
                        # print(curinst)
                        if tblk.get_curhd_by_name():
                            idx = [i for i,ele in enumerate(tblk._cust_insts['instref']) if ele==blk]
                            #print(tblk._cust_insts['instref'])
                            #print('mimidxffff:',blk,idx)
                            if idx:
                                if re.search(r':\w+\=\{\d+\s+\d+\}',tblk._cust_insts['insthier'][idx[0]]):
                                    #mline_blks.append(blk)
                                    sline_blks.append(blk)
                    if cblk.hdlevel == 'lib' or cblk.hdlevel == 'pll':
                        if tblk.get_curmac_by_name():
                            idx = [i for i,ele in enumerate(tblk._cust_insts['macref']) if ele==blk]
                            #print(idx)
                            if idx:
                                if re.search(r':\w+\=\{\d+\s+\d+\}',tblk._cust_insts['machier'][idx[0]]):
                                    #mline_blks.append(blk)
                                    sline_blks.append(blk)
                    if cblk.hdlevel == 'soft' or cblk.hdlevel == 'crg':
                        if tblk.get_curdig_by_name():
                            idx = [i for i,ele in enumerate(tblk._cust_insts['digref']) if ele==blk]
                            #print(idx)
                            if idx:
                                if re.search(r':\w+\=\{\d+\s+\d+\}',tblk._cust_insts['dighier'][idx[0]]):
                                    #mline_blks.append(blk)
                                    sline_blks.append(blk)

        #print('ML blks++++++++++++:',mline_blks,'SL blks:',sline_blks)
        return mline_blks,sline_blks

    def get_curmim_info(self,name,blk,type=''):
        mblks,sblks = self.get_curmim_blks(name,type)
        if blk in sblks:
            return 'SLMIM'
        elif blk in mblks:
            return 'MLMIM'
        else:
            return 'NOMIM'

    # 'MCUJPEG_CRG1_CRG_crg': 'clk_core';; CRG1 from inst_dig
    # 'MCUJPEG_PLL1:1_PLL_pll': 'pll_top_wrap'
    # cover crg/pll, pll clk defined through clkdef
    # flg='org' for multi crg/pll
    def get_macdig_by_name(self,name,lvl,flg=''):
        fblk = self.get_block_by_name(name)
        macdig = []
        if fblk.get_curdig_by_name(flg):
            macdig.extend(fblk.get_curdig_by_name(flg))
        if fblk.get_curmac_by_name(flg):
            macdig.extend(fblk.get_curmac_by_name(flg))
        #macdig = fblk.get_curdig_by_name() + fblk.get_curmac_by_name()

        crgpll_lst = {}
        if macdig:
            for bk in list(set(macdig)):
                blk = self.get_block_by_name(bk)
                if re.search(r'lib|pll',lvl) and blk.hdlevel == lvl and 'macref' in fblk._cust_insts:
                    # lib/pll
                    midx = [i for i,ele in enumerate(fblk._cust_insts['macref']) if ele==bk]
                    if midx:
                        for idx in midx:
                            mals = fblk._cust_insts['macalias'][idx]
                            if mals:
                                refals = fblk.alias + f'_{mals}'                   
                            else:
                                refals = fblk.alias + f'_{blk.alias}'
                            if 'lib' in lvl:
                                crgpll_lst[f'{refals}_{blk.alias}_MAC{lvl.upper()}'] = bk
                            else:
                                crgpll_lst[f'{refals}_{blk.alias}_{lvl.upper()}'] = bk                    
                
                if re.search(r'crg|soft|pll',lvl) and blk.hdlevel == lvl and 'digref' in fblk._cust_insts:
                    # soft/crg/pll
                    didx = [i for i,ele in enumerate(fblk._cust_insts['digref']) if ele==bk]
                    if didx:
                        for idx in didx:
                            dals = fblk._cust_insts['digalias'][idx]
                            if dals:
                                refals = fblk.alias + f'_{dals}'                   
                            else:
                                refals = fblk.alias + f'_{blk.alias}'
                            if 'soft' in lvl:
                                crgpll_lst[f'{refals}_{blk.alias}_DIG{lvl.upper()}'] = bk
                            else:
                                crgpll_lst[f'{refals}_{blk.alias}_{lvl.upper()}'] = bk              
 
        return crgpll_lst

    # 'MCUJPEG_CR8_CR8_DIGSOFT': 'usersdc'
    # cover soft/lib
    def get_usersdc_by_name(self,name):
        fblk = self.get_block_by_name(name)
        macuser = fblk.get_curuser_by_name('mac_insts')
        diguser = fblk.get_curuser_by_name('dig_insts')

        user_dic = {}
        if macuser:
            for usr in list(set(macuser)):
                if usr:
                    midx = [i for i,ele in enumerate(fblk._cust_insts['macuser']) if ele==usr]
                    if midx:
                        for idx in midx:
                            mals = fblk._cust_insts['macalias'][idx]
                            bk = fblk._cust_insts['macref'][idx]
                            blk = self.get_block_by_name(bk)
                            if mals:
                                refals = fblk.alias + f'_{mals}'                  
                            else:
                                refals = fblk.alias + f'_{blk.alias}'
                            user_dic[f'{refals}_{blk.alias}_MAC{blk.hdlevel.upper()}'] = usr
        if diguser:
            for usr in list(set(diguser)):
                if usr:                
                    didx = [i for i,ele in enumerate(fblk._cust_insts['diguser']) if ele==usr]
                    if didx:
                        for idx in didx:
                            dals = fblk._cust_insts['digalias'][idx]
                            bk = fblk._cust_insts['digref'][idx]
                            blk = self.get_block_by_name(bk)
                            if dals:
                                refals = fblk.alias + f'_{dals}'                  
                            else:
                                refals = fblk.alias + f'_{blk.alias}'
                            user_dic[f'{refals}_{blk.alias}_DIG{blk.hdlevel.upper()}'] = usr      
 
        return user_dic


    # get power variables
    def get_hier_dcdc(self,name,hflg=False):
        pwrlst = []
        tblk = self.get_block_by_name(name)
        pwr = tblk.prime_pwr.split(' ')[0].strip()
        volg = tblk.prime_pwr.split(' ')[1].strip()
        pwrg = pwr + f' {volg}'
        pwrlst.append(pwrg)

        if not hflg:
            hblks = self.get_curblks(name)
        else:
            hblks = self.get_hierblks(name)

        for bk in hblks:
            blk =  self.get_block_by_name(bk)
            pwr = blk.prime_pwr.split(' ')[0].strip()
            volg = blk.prime_pwr.split(' ')[1].strip()
            pwrg = pwr + f' {volg}'
            if pwrg not in pwrlst:                
                pwrlst.append(pwrg)
        
        return pwrlst

    # 'MCUJPEG': ['VDDMCLPS_VDDM_CLPS1 TT0P800V TT0P750V TT0P700V','VDDMCLPS_VDDM_CLPS2 TT0P800V TT0P750V TT0P700V']
    # def get_hier_alias_dcdc(self,name,hflg=False):
    #     hals_dcdc = {}
    #     pwrlst = []
    #     tblk = self.get_block_by_name(name)
    #     pwrlst.append(fblk.prime_pwr.split(' ')[0].strip())
    #     hals_dcdc[fblk.alias] = fblk.prime_pwr.split()
    #     if not hflg:
    #         blks = self.get_curblks(name)
    #     else:
    #         blks = self.get_hierblks(name)

    #     for bk in blks:
    #         blk = self.get_block_by_name(bk)
            
    #         fblk = self.get_fblk(name,blk)
    #         fbk = self.get_block_by_name(fblk[0])
    #         minfo = self.get_mim_info(fblk[0],bk)
    #         vol = blk.prime_pwr.split(' ')[0].strip()
    #         pwrlst.append(vol)
    #         idxlst = [i for i,ele in enumerate(fbk._cust_insts[f'{kw}ref']) if ele==bk]
    #         if minfo == 'MLMIM':
    #         hals_dcdc[blk.alias] = blk.prime_pwr
                
    
    #hdmi_top_wrap: [['mcu_jpeg_top_wrap', 'async_css_wrap'], ['mcu_jpeg_top_wrap']]
    #spg_top: [['jpeg_top_wrap', 'hdmi_top_wrap'], ['mcu_jpeg_top_wrap'], ['mcu_jpeg_top_wrap', 'async_css_wrap'], ['mcu_jpeg_top_wrap']]
    # def get_hierfblks(self,name,blk,tblks=[],fblks=[]):
    #     hiertrees = self.get_hiertrees(name)
    #     print(blk,tblks,fblks)

    #     # if fblks:
    #     #     fblks = []

    #     if blk == name:
    #         sdc_info(f'{blk} is current top level.')

    #     if not tblks and blk != name:
    #         tblks.append(blk)

    #     fblk = [ky for ky,vl in hiertrees.items() if blk in vl]
    #     #tblks.append(fblk)
    #     if len(fblk) == 1 and fblk[0] == name:
    #         tblks.append(fblk[0])           
    #         fblks.append(' '.join(tblks))
    #         tblks =[]
    #         print('seeeeeeww',blk,fblk,tblks,fblks)

    #     if len(fblk) > 1:
    #         sdc_warn(f'Find more than one {fblk} of {blk} in {name}, please confirm hier yaml file.')
    #         for bk in fblk:
    #             if bk == name:
    #                 tblks.append(bk)
    #                 fblks.append(' '.join(tblks))
    #                 tblks=[]
    #                 print('ppppppppww',blk,fblk,tblks,fblks)
    #             if bk != name:
    #                 if not tblks:
    #                     tblks.append(blk)
    #                 tblks.append(bk)
    #                 print('strrrrrrww',blk,fblk,tblks,fblks)
    #                 self.get_hierfblks(name,bk,tblks,fblks)
        
    #     if len(fblk) == 1 and fblk[0] != name:
    #         tblks.append(fblk[0])
    #         self.get_hierfblks(name,fblk[0],tblks,fblks)

    #     print('hier fblks:',fblks)          
    #     return fblks

    #[['jpeg_wrap', 'hdmi_wrap'], ['mcu_wrap'], ['mcu_wrap', 'async_wrap', 'spg_wrap'], ['mcu_wrap']]
    #[['jpeg_wrap', 'mcu_wrap'], ['hdmi_wrap', 'mcu_wrap'],['hdmi_wrap', 'async_wrap', 'mcu_wrap'],['hdmi_wrap', 'spg_wrap', 'mcu_wrap']]
    #[['jpeg_wrap mcu_wrap', 'hdmi_wrap mcu_wrap', 'hdmi_wrap async_wrap mcu_wrap','hdmi_wrap spg_wrap mcu_wrap']  

    # support four levels with forward trace
    # L0 = ['spg_top 2'], L1 = ['jpeg_top_wrap 1','hdmi_top_wrap 2'], 
    # L2 = ['mcu_jpeg_top_wrap 0','mcu_jpeg_top_wrap 0', 'async_css_wrap 1']
    # L3 = ['mcu_jpeg_top_wrap 0'], L4 = []
    def get_hierfblks(self,name,blk):
        fblks = []
        fxblks = []
        fl0 = []
        fl1 = []
        fl2 = []
        fl3 = []
        fl4 = []
        fl5 = []
        tfl1 = []
        tfl2 = []
        tfl3 = []
        tfl4 = []
        tfl5 = []
        tfl6 = []

        if blk == name:
            sdc_info(f'{blk} is current top level.')  

        if blk != name:
            # L0
            tfl1 = self.get_fblk(name,blk)
            tnum1 = str(len(tfl1))
            fl0.append(blk + ' ' + tnum1)

            # L1
            if tfl1:
                fl1,tfl2 = self.get_fblk_info(name,tfl1)
            # L2
            if tfl2:
                fl2,tfl3 = self.get_fblk_info(name,tfl2)
            # L3
            if tfl3:
                fl3,tfl4 = self.get_fblk_info(name,tfl3)
            # L4
            if tfl4:
                fl4,tfl5 = self.get_fblk_info(name,tfl4)

            # L5
            if tfl5:
                fl5,tfl6 = self.get_fblk_info(name,tfl5)

        if fl5:
            if fl5[0] != name:
                sdc_error(f'Design level of {name} tracing from {blk} greater than 6. What partition!')
         
        # print('hier fblk f0:',fl0)
        # print('hier fblk f1:',fl1,tfl1)
        # print('hier fblk f2:',fl2,tfl2)
        # print('hier fblk f3:',fl3,tfl3)
        # print('hier fblk f4:',fl4,tfl5)
        # print('hier fblk f4:',fl5,tfl6)

        if fl1 and fl2 and fl3 and fl4 and fl5:
            #for bk1 in fl1:
            for i in range(len(fl1)):
                tbk1 = fl1[i].split(' ')[0]
                nbk1 = int(fl1[i].split(' ')[1])
                if tbk1 == name and nbk1 == 0:
                    fblks.append(blk + ' ' + tbk1)
                if nbk1 > 0 and fl2:
                    for j in range(nbk1):
                        tbk2 = fl2[j].split(' ')[0]
                        nbk2 = int(fl2[j].split(' ')[1])
                        if tbk2 == name and nbk2 == 0:
                            fblks.append(blk + ' ' + tbk1 + ' ' + tbk2)
                        if nbk2 > 0 and fl3:
                            for k in range(nbk2):
                                tbk3 = fl3[k].split(' ')[0]
                                nbk3 = int(fl3[k].split(' ')[1])
                                if tbk3 == name and nbk3 == 0:
                                    fblks.append(blk + ' ' + tbk1 + ' ' + tbk2 + ' ' + tbk3)
                                if nbk3 > 0 and fl4:
                                    for p in range(nbk3):
                                        tbk4 = fl4[p].split(' ')[0]
                                        nbk4 = int(fl4[p].split(' ')[1])
                                        if tbk4 == name and nbk4 == 0:
                                            fblks.append(blk + ' ' + tbk1 + ' ' + tbk2 + ' ' + tbk3 + ' ' + tbk4)
                                        #if nbk4 > 1 or len(fl5) > 1:
                                        if nbk4 > 1:
                                            sdc_error(f'Design level of {name} tracing from {blk} greater than 6. What partition!')
                                        else:
                                            #for l in range(len(fl5)):
                                            tbk5 = fl5[0].split(' ')[0]
                                            nbk5 = int(fl5[0].split(' ')[1])
                                            if tbk5 == name and nbk5 == 0:
                                                fblks.append(blk + ' ' + tbk1 + ' ' + tbk2 + ' ' + tbk3 + ' ' + tbk4 + ' ' + tbk5)
                                                sdc_info(f'Design level of {name} tracing from {blk} is 6.')
                                    fl4 = fl4[nbk3:]
                            fl3 = fl3[nbk2:]
                    fl2 = fl2[nbk1:]
            #['tpg_top arv_top jpeg_top_wrap mcu_jpeg_top_wrap sys_camera_top_pwr_wrap', 
            #'tpg_top arv_top jpeg_top_wrap mcu_jpeg_top_wrap sys_camera_top_pwr_wrap sys_camera_top_pwr_wrap'] 
            gxblks = []        
            for sx in fblks:
                nx = sx.split(' ')
                tx = []
                for x in nx:
                    if not x in tx:
                        tx.append(x)
                gxblks.append(' '.join(tx))
            #fxblks = list(set(fxblks))
            for n in gxblks:
                if not n in fxblks:
                    fxblks.append(n)

            # print('6 level hier fblk:',fblks)
            # print('hier fblk f1:',fl1)
            # print('hier fblk f2:',fl2)
            # print('hier fblk f3:',fl3)
            # print('hier fblk f4:',fl4)
            # print('hier fblk f5:',fl5)


        if fl1 and fl2 and fl3 and fl4 and not fl5:
            #for bk1 in fl1:
            for i in range(len(fl1)):
                tbk1 = fl1[i].split(' ')[0]
                nbk1 = int(fl1[i].split(' ')[1])
                if tbk1 == name and nbk1 == 0:
                    fblks.append(blk + ' ' + tbk1)
                if nbk1 > 0 and fl2:
                    for j in range(nbk1):
                        tbk2 = fl2[j].split(' ')[0]
                        nbk2 = int(fl2[j].split(' ')[1])
                        if tbk2 == name and nbk2 == 0:
                            fblks.append(blk + ' ' + tbk1 + ' ' + tbk2)
                        if nbk2 > 0 and fl3:
                            for k in range(nbk2):
                                tbk3 = fl3[k].split(' ')[0]
                                nbk3 = int(fl3[k].split(' ')[1])
                                if tbk3 == name and nbk3 == 0:
                                    fblks.append(blk + ' ' + tbk1 + ' ' + tbk2 + ' ' + tbk3)
                                if nbk3 > 0 and fl4:
                                    #if nbk3 > 1 or len(fl4) > 1:
                                    if nbk3 > 1:
                                        sdc_error(f'Design level of {name} tracing from {blk} greater than 5. What partition!')
                                    else:
                                        #for l in range(len(fl4)):
                                        tbk4 = fl4[0].split(' ')[0]
                                        nbk4 = int(fl4[0].split(' ')[1])
                                        if tbk4 == name and nbk4 == 0:
                                            fblks.append(blk + ' ' + tbk1 + ' ' + tbk2 + ' ' + tbk3 + ' ' + tbk4)
                                            sdc_info(f'Design level of {name} tracing from {blk} is 5.')
                            fl3 = fl3[nbk2:]
                    fl2 = fl2[nbk1:]
                #print('5 level hier fblk:',fblks)
                # print('hier fblk f1:',fl1)
                # print('hier fblk f2:',fl2)
                # print('hier fblk f3:',fl3)
                # print('hier fblk f4:',fl4)
            gxblks = []
            for sx in fblks:
                nx = sx.split(' ')
                tx = []
                for x in nx:
                    if not x in tx:
                        tx.append(x)
                gxblks.append(' '.join(tx))
            #fxblks = list(set(fxblks))
            for n in gxblks:
                if not n in fxblks:
                    fxblks.append(n)

        if fl1 and fl2 and fl3 and not fl4 and not fl5:
            #for bk1 in fl1:
            for i in range(len(fl1)):
                tbk1 = fl1[i].split(' ')[0]
                nbk1 = int(fl1[i].split(' ')[1])
                if tbk1 == name and nbk1 == 0:
                    fblks.append(blk + ' ' + tbk1)
                if nbk1 > 0 and fl2:
                    for j in range(nbk1):
                        tbk2 = fl2[j].split(' ')[0]
                        nbk2 = int(fl2[j].split(' ')[1])
                        if tbk2 == name and nbk2 == 0:
                            fblks.append(blk + ' ' + tbk1 + ' ' + tbk2)
                        if nbk2 > 0 and fl3:
                            #if nbk2 > 1 or len(fl3) > 1:
                            if nbk2 > 1:
                                sdc_error(f'Design level of {name} tracing from {blk} greater than 4. What partition!')
                            else:
                                #for k in range(len(fl3)):
                                tbk3 = fl3[0].split(' ')[0]
                                nbk3 = int(fl3[0].split(' ')[1])
                                if tbk3 == name and nbk3 == 0:
                                    fblks.append(blk + ' ' + tbk1 + ' ' + tbk2 + ' ' + tbk3)
                                    sdc_info(f'Design level of {name} tracing from {blk} is 4.')
                            
                    fl2 = fl2[nbk1:]
            #print('4 level hier fblk:',fblks)
            gxblks = []
            for sx in fblks:
                nx = sx.split(' ')
                tx = []
                for x in nx:
                    if not x in tx:
                        tx.append(x)
                gxblks.append(' '.join(tx))
            #fxblks = list(set(fxblks))
            for n in gxblks:
                if not n in fxblks:
                    fxblks.append(n)


        if fl1 and fl2 and not fl3 and not fl4 and not fl5:
            #for bk1 in fl1:
            for i in range(len(fl1)):
                tbk1 = fl1[i].split(' ')[0]
                nbk1 = int(fl1[i].split(' ')[1])
                if tbk1 == name and nbk1 == 0:
                    fblks.append(blk + ' ' + tbk1)
                #print('WWWWWWWWWWWWWWWWW+++++:',tbk1,nbk1,fl2,fblks)
                if nbk1 > 0 and fl2:
                    #if nbk1 > 1 or len(fl2) > 1:
                    if nbk1 > 1:
                        sdc_error(f'Design level of {name} tracing from {blk} greater than 3. What partition!')
                    else:
                        #for k in range(len(fl2)):
                        tbk2 = fl2[0].split(' ')[0]
                        nbk2 = int(fl2[0].split(' ')[1])
                        if tbk2 == name and nbk2 == 0:
                            fblks.append(blk + ' ' + tbk1 + ' ' + tbk2)
                            sdc_info(f'Design level of {name} tracing from {blk} is 3.')
            #print('3 level hier fblk:',fblks)
            gxblks = []
            for sx in fblks:
                nx = sx.split(' ')
                tx = []
                for x in nx:
                    if not x in tx:
                        tx.append(x)
                gxblks.append(' '.join(tx))
            #fxblks = list(set(fxblks))
            for n in gxblks:
                if not n in fxblks:
                    fxblks.append(n)
                                              

        if fl1 and not fl2 and not fl3 and not fl4 and not fl5:
            #for bk1 in fl1:
            for i in range(len(fl1)):
                tbk1 = fl1[i].split(' ')[0]
                nbk1 = int(fl1[i].split(' ')[1])
                if tbk1 == name and nbk1 == 0:
                    fblks.append(blk + ' ' + tbk1)
                    sdc_info(f'Design level of {name} tracing from {blk} is 2.')
            #print('2 level hier fblk:',fblks)
            gxblks = []
            for sx in fblks:
                nx = sx.split(' ')
                tx = []
                for x in nx:
                    if not x in tx:
                        tx.append(x)
                gxblks.append(' '.join(tx))
            #fxblks = list(set(fxblks))
            for n in gxblks:
                if not n in fxblks:
                    fxblks.append(n)
            
        return  fxblks                          


    # xtfl: ['a','b']
    def get_fblk_info(self,name,xtfl):
        tfl2 = []
        fl1 = []
        #print(xtfl)
        for bk in xtfl:           
            if bk == name:
                fl1.append(bk + ' ' + '0')
            else:
                tfl = self.get_fblk(name,bk)
                #tnum = str(len(tfl))                        
                fl1.append(bk + ' ' + str(len(tfl)))                
                #tfl2.append(' '.join(tfl))
                for tbk in tfl:
                    tfl2.append(tbk)
                    # if tbk == name:
                    #     fl1.append(tbk + ' ' + '0')
                    # else:
                    #     xfl = self.get_fblk(name,tbk)
                    #     fl1.append(tbk + ' ' + str(len(xfl)))
                        
        return fl1,tfl2


    # 'ISPTOP_HDR', 'u_/isptop/u_hdr_top'
    # als need initial blk.alias, but als is '' for MLMIM
    # if blk is slblk and only one level mim, blk.alias is 'VNPUMM${i}${j}' or 'VNPUMM${i}'
    # if blk is mlblk and only one level mim, blk.alias is from insts of father blk
    # if do not support hd in mim or multi level mim currently
    # alias/pwr in hier yaml represent variables and value without mim, but variables for mim
    # alias value need concat father alias and child alias, but pwr do not concat
    # alias value format: CAMSYS_MCUJPEG /MCUJPEG_MCUPLL1(for MIM)
    # dcdc value format: 'VDDMCLPS_VDDM_CLPS TT0P800V TT0P750V TT0P700V'
    def get_hier_alias_hier(self,name,blk):

        xblkals = []
        xblkhier = []

        tbk = self.get_block_by_name(name)
        tals = tbk.alias
        if tbk.hdlevel == 'sys':
            lvl = 'SYS'
        else:
            lvl = 'BLK'
        thier = f'$SDCVAR(HIER,{lvl},${{{tals}}})'
        #print('start blk:',blk)
        fblks = self.get_hierfblks(name,blk)
        #print('final,hierblk:',fblks)

        #final,hierblk: ['hdmi_top_wrap mcu_jpeg_top_wrap', 'hdmi_top_wrap async_css_wrap mcu_jpeg_top_wrap']
        #final,hierblk: ['gnpu_nne_i8_psum_core_group mcu_jpeg_top_wrap']
        #final,hierblk: ['spg_top jpeg_top_wrap mcu_jpeg_top_wrap', 'spg_top hdmi_top_wrap mcu_jpeg_top_wrap', 'spg_top hdmi_top_wrap async_css_wrap mcu_jpeg_top_wrap']
        # ***** only one blk mim and only one level hd in mim *****
        for xf in fblks:
            blkals = []
            blkhier = []
            tmpals = '' # not MLMIM
            tmphier = ''
            nf = xf.split(' ')
            for i in range(len(nf)):
                #print('nf:',nf,i,nf[i],'xf:',xf)             
                cbk = self.get_block_by_name(nf[i])
                cals = cbk.alias 
                clvl = cbk.hdlevel
                if nf[i] == name:
                    if not blkals:
                        blkals.append(name)
                    elif len(blkals) >= 1:
                        blkals = [f'{tals}_{bls}' for bls in blkals]
                    # blkhier
                    #break
                    #print('hieralias1',blkals,blkhier)
                    
                else:
                    hbk = self.get_block_by_name(nf[i+1])
                    hals = hbk.alias
                    curblks = self.get_curblks(nf[i+1])
                    minfo = self.get_curmim_info(nf[i+1],nf[i],'')
                    #print(nf[i],minfo)

                    if curblks:
                        if clvl == 'sys' or clvl == 'blk' or clvl == 'top':
                            idxlst = [j for j,ele in enumerate(hbk._cust_insts[f'instref']) if ele==nf[i]]
                            kw = 'inst'
                        if clvl == 'lib' or clvl == 'pll':
                            idxlst = [j for j,ele in enumerate(hbk._cust_insts[f'macref']) if ele==nf[i]]
                            kw = 'mac'
                        if clvl == 'soft' or clvl == 'crg':
                            idxlst = [j for j,ele in enumerate(hbk._cust_insts[f'digref']) if ele==nf[i]]
                            kw = 'dig'
                        #print('hieraliasGxx',hbk._cust_insts[f'{kw}ref'],idxlst)

                        # blk is mim          
                        if minfo == 'MLMIM' and len(idxlst) > 1:
                            for idx in idxlst:
                                xals = hbk._cust_insts[f'{kw}alias'][idx]
                                if xals:
                                    if tmpals:
                                        xmpals = f'{xals}_{tmpals}'
                                    else:
                                        xmpals = f'{xals}'
                                else:
                                    sdc_error(f'Missing alias value for mim {nf[i]}.So use same alias {cals}')
                                    if tmpals:
                                        xmpals += f'{cals}_{tmpals}'
                                    else:
                                        xmpals = f'{cals}'

                                # already for upper level
                                xhier = hbk._cust_insts[f'{kw}hier'][idx]
                                if xhier:
                                    if tmphier:
                                        xmphier = f'{xhier}/${tmphier}'
                                    else:
                                        xmphier = f'{xhier}'
                                blkals.append(xmpals)
                                blkhier.append(xmphier)
                                #print('hieralias2',tmpals,tmphier,blkals,blkhier)

                            #print('hieralias3',blkals,blkhier)

                        if len(idxlst) == 1:
                            if minfo == 'SLMIM':
                                nals = hbk._cust_insts[f'{kw}alias'][idxlst[0]]
                            if minfo == 'NOMIM':
                                if hbk._cust_insts[f'{kw}alias'][idxlst[0]]:
                                    nals = hbk._cust_insts[f'{kw}alias'][idxlst[0]]
                                else:
                                    nals = cals

                            if nals:
                                if not blkals:
                                    tmpals = nals
                                    blkals.append(nals)
                                else:
                                    #print('xxxxblkals:',blkals,f'{nals}_{blkals[0]}')
                                    if len(blkals) == 1:
                                        tmpals = f'{nals}_{blkals[0]}'
                                        #blkals.append(f'{nals}_{blkals[0]}')                            
                                    if len(blkals) >= 1:
                                        blkals = [f'{nals}_{bls}' for bls in blkals]
                                        # for bls in blkals:
                                        #     blkals.append(f'{nals}_{bls}')

                            nhier = hbk._cust_insts[f'{kw}hier'][idxlst[0]]
                            if nhier:
                                if not blkhier:
                                    tmphier = nhier
                                    blkhier.append(nhier)
                                else:
                                    if len(blkhier) == 1:
                                        tmphier = f'{nhier}/{blkhier[0]}'
                                        #blkhier.append(f'{nhier}/{blkhier[0]}')                                  
                                    if len(blkhier) >= 1:
                                        blkhier = [f'{nhier}/{bls}' for bls in blkhier]
                                        # for bls in blkhier:
                                        #     blkhier.append(f'{nhier}/{bls}')

                            #print('hieralias4',blkals,blkhier)
            
            if not xblkals:
                xblkals = blkals
            else:
                for als in blkals:
                    xblkals.append(als)
            if not blkhier:
                xblkhier = blkhier
            else:
                for hier in blkhier:
                    xblkhier.append(hier)
            #print('hieralias5',xblkals,xblkhier)

        return xblkals,[f'{thier}{hier}' for hier in xblkhier]     

    # from alias value(mim) to name
    def get_name_by_alias(self,name,alias,hflg=False):
        rblk = ''
        if hflg:
            blksg = self.get_hierblks(name)
            blks = [x for x in blksg if not x is name]
        else:
            blks = self.get_curblks(name)

        # 'MCUJPEG_MCUCRG1', 'MCUCRG1'
        if '_' in alias:
            als = alias.split('_')[1]
        else:
            als = alias

        for bk in blks:
            blk = self.get_block_by_name(bk)
            if blk.alias == als:
                rblk = bk
                #return rblk
                break
        
        if not rblk:
            if not hflg:
                tref = []
                blk = self.get_block_by_name(name)
                tref_inst = self.get_curblk_diff_attr(blk,als,'inst','alias','ref')
                tref_mac = self.get_curblk_diff_attr(blk,als,'mac','alias','ref')
                tref_dig = self.get_curblk_diff_attr(blk,als,'dig','alias','ref')

                if tref_inst:
                    tref.extend(tref_inst)
                if tref_mac:
                    tref.extend(tref_mac)
                if tref_dig:
                    tref.extend(tref_dig)

                if tref:
                    nref = list(set(tref))
                    if len(nref) == 0:
                        sdc_warn(f'Missing {bk} alias "{alias}" in level {name}')
                    elif len(nref) > 1:
                        rblk = ' '.join(tref)
                        sdc_warn(f'Find more than one block {bk} alias "{alias}" in level {name}')
                    else:
                        rblk = tref[0]
            else:
                for bk in blks:
                    blk = self.get_block_by_name(bk)
                    cblks = self.get_curblks(bk)
                    #print('get_name_by_alias',blk,cblks)
                    if cblks:
                        tref_inst = self.get_curblk_diff_attr(blk,als,'inst','alias','ref')
                        tref_mac = self.get_curblk_diff_attr(blk,als,'mac','alias','ref')
                        tref_dig = self.get_curblk_diff_attr(blk,als,'dig','alias','ref')

                        if tref_inst:
                            tref.extend(tref_inst)
                        if tref_mac:
                            tref.extend(tref_mac)
                        if tref_dig:
                            tref.extend(tref_dig)

                if tref:
                    nref = list(set(tref))
                    if len(nref) == 0:
                        sdc_warn(f'Missing {bk} alias "{alias}" in level {name}')
                    elif len(nref) > 1:
                        rblk = ' '.join(tref)
                        sdc_warn(f'Find more than one block {bk} alias "{alias}" in level {name}')
                    else:
                        rblk = tref[0]

        return rblk
    
    def get_curblk_diff_attr(self,blk,als,kw1='inst',kw2='alias',kw3='ref'):
        tref = []
        if f'{kw1}{kw2}' in blk._cust_insts:
            ridx = [i for i,ele in enumerate(blk._cust_insts[f'{kw1}{kw2}']) if ele==als]
            if ridx:
                for idx in ridx:
                    ref = blk._cust_insts[f'{kw1}{kw3}'][idx]
                    if ref:
                        tref.append(ref)
        return tref

    # 'MCUCRG': ['MCUJPEG_MCUCRG1','MCUJPEG_MCUCRG2']
    # 'MCUJPEG': ['MCUJPEG']
    def get_alias_varval_by_name(self,name,sblk) -> dict:
        rals = {}
        #blks = self.get_hierblks(name)
        blkg = self.get_block_by_name(sblk)
        alsvar = blkg.alias

        fbk = self.get_fblk(name,sblk)
        fblk = self.get_block_by_name(fbk[0])
        blks = self.get_curblks(fbk[0])
        tals = []
        if blkg.hdlevel == 'blk' or blkg.hdlevel == 'sys':
            ridx = [i for i,ele in enumerate(fblk._cust_insts['instref']) if ele==sblk]           
            if ridx:
                for idx in ridx:
                    als = fblk.alias + '_' + fblk._cust_insts['instalias'][idx]
                    if als:
                        tals.append(als)
                if not tals:
                    tals.append(alsvar)
        
        else:
            if 'macref' in fblk._cust_insts:
                midx = [i for i,ele in enumerate(fblk._cust_insts['macref']) if ele==sblk]
                if midx:
                    for idx in midx:
                        als = fblk.alias + '_' + fblk._cust_insts['macalias'][idx]
                        if als:
                            tals.append(als)
                    if not tals:
                        tals.append(alsvar)

            if 'digref' in fblk._cust_insts:
                didx = [i for i,ele in enumerate(fblk._cust_insts['digref']) if ele==sblk]
                if didx:
                    for idx in didx:
                        als = fblk.alias + '_' + fblk._cust_insts['digalias'][idx]
                        if als:
                            tals.append(als)
                    if not tals:
                        tals.append(alsvar)

        if tals:
            rals[alsvar] = tals
        
        return rals

    # 'VDDM_PLS': ['VDDM_PLS1','VDDM_PLS2']
    # 'VDDM_PLS': ['VDDM_PLS']
    def get_dcdc_varval_by_name(self,name,sblk) -> dict:
        rdcdc = {}
        #blks = self.get_hierblks(name)
        blkg = self.get_block_by_name(sblk)
        dcdc = blkg.prime_pwr.split(' ')[0].strip()

        fbk = self.get_fblk(name,sblk)
        fblk = self.get_block_by_name(fbk[0])
        blks = self.get_curblks(fbk[0])
        tdcdc = []
        if blkg.hdlevel == 'blk' or blkg.hdlevel == 'sys':
            ridx = [i for i,ele in enumerate(fblk._cust_insts['instref']) if ele==sblk]           
            if ridx:
                for idx in ridx:
                    dcdc = fblk._cust_insts['instpwr'][idx]
                    if dcdc:
                        tdcdc.append(dcdc)
                if not tdcdc:
                    tdcdc.append(dcdc)
        
        else:
            if 'macref' in fblk._cust_insts:
                midx = [i for i,ele in enumerate(fblk._cust_insts['macref']) if ele==sblk]
                if midx:
                    for idx in midx:
                        dcdc = fblk._cust_insts['macpwr'][idx]
                        if dcdc:
                            tdcdc.append(dcdc)
                    if not tdcdc:
                        tdcdc.append(dcdc)

            if 'digref' in fblk._cust_insts:
                didx = [i for i,ele in enumerate(fblk._cust_insts['digref']) if ele==sblk]
                if didx:
                    for idx in didx:
                        dcdc = fblk._cust_insts['digpwr'][idx]
                        if dcdc:
                            tdcdc.append(dcdc)
                    if not tdcdc:
                        tdcdc.append(dcdc)

        if tdcdc:
            rdcdc[dcdc] = tdcdc
        
        return rdcdc


    # 'MCUJPEG': '$SDCVAR(HIER,SYS,${CAMSYS}u_sys_camera_top/u_mcu_jpeg_top_pwr_wrap)'
    def get_subblk_hier(self,name,hier=False):
        pass


    # def set_subblk_intg(self,name,alias,filekw):
    #     # block order ??
    #     hdblksg = self.get_hierlvlblks(name,outtype='hd')
    #     #hdblks = [x for x in hdblksg if not x is name]
    #     print('all hd blks',hdblksg)
    #     #all hd blks ['mcu_jpeg_top_wrap', 'jpeg_top_wrap', 'hdmi_top_wrap', 'iip_ggs_core', 
    #     #             'gnpu_nne_i8_psum_core_group', 'spg_top', 'tpg_top', 'pll_top']

    #     subvars = ''
    #     # for hdbk in hdblksg:
    #     #     hdblks = []
    #     #     tblk = self.get_block_by_name(hdbk)
    #     #     tcurhd = tblk.get_curhd_by_name()
    #     #     if tcurhd:
    #     #         for x in tcurhd:
    #     #             if x not in hdblks:
    #     #                 hdblks.append(x)
    #     #     mblks,sblks = self.get_curmim_blks(hdbk,'')
    #     #     print('subblk hdblkxxx',hdbk,hdblks,mblks,sblks)  
    #     #     if hdblks:  
    #     #         subvars += self.get_subblk_intg(name,hdblks,mblks,sblks,filekw)

    #     subvars += self.get_subblk_intg(name,hdblksg,filekw)

    #     return subvars

    def sep_mim_blks(self,name,subblks):
        nomblks = []
        mlblks = []
        slblks = []

        for bk in subblks:
            mlflg = None
            slflg = None
            noflg = None

            fblks = self.get_fblk(name,bk)
            if fblks:
                for fbk in fblks:
                    minfo = self.get_curmim_info(fbk,bk)
                    if minfo == 'MLMIM':
                        mlflg = 1
                    if minfo == 'SLMIM':
                        slflg = 1
                    if minfo == 'NOMIM':
                        noflg = 1
                if  mlflg:
                    mlblks.append(bk)
                if slflg:
                    slblks.append(bk)
                if noflg:
                    nomblks.append(bk)
            else:
                printlog(f'Can not find father block {bk}')

        # print('nomblks:',nomblks)
        # print('mlblks:',mlblks)
        # print('slblks:',slblks)
        nomxblks = []
        if nomblks and mlblks:
            nomxblks = [x for x in nomblks if not x in mlblks]
        else:
            nomxblks = nomblks

        return nomxblks,mlblks,slblks
    
    # mode: 'full' / 'partial'
    # type: '' / 'mbist'
    def set_subblk_intg(self,name,filekw,sname=[],mode='full',type=''):
        varg = ''

        if mode == 'full' and not sname:
            hdblksg = self.get_hierlvlblks(name,outtype='hd')
            hdblks = [x for x in hdblksg if not x is name]
        if mode == 'partial' and sname:
            hdblks = sname

        if not hdblks:
            nomblks = []
            mlblks = []
            slblks = []
            sdc_info(f'Can not find subblk name list and write out subblk intg.')
        else:
            nomblks,mlblks,slblks = self.sep_mim_blks(name,hdblks)

        # no mim block
        if nomblks:
            for blknm in nomblks:
                blk = self.get_block_by_name(blknm)
                # if blk.alias not in subalias:
                #     subalias.append(blk.alias)
                lvl = blk.hdlevel
                if lvl == 'sys':
                    plvl = 'SYS'
                else:
                    plvl = 'BLK'
                bkals,bkhier = self.get_hier_alias_hier(name,blknm)
                #print('hier_alias',blknm,bkals,bkhier)
                nalias = blk.alias
                lalias = blk.alias.lower()
                if bkals and bkhier:
                    if len(bkals) == 1:
                        sbals = bkals[0]
                        sbhier = bkhier[0]
                        if type == 'mbist':
                            varg += f'''
#############################################################
## Integration of {blknm}_mbist.sdc
#############################################################
set {nalias} "{sbals}"
if {{[info exists SDCVAR(IS_FLAT,${{{nalias}}})]}} {{
}} else {{
	set SDCVAR(IS_FLAT,${{{nalias}}}) "1"
}}

if {{[info exists SDCVAR(LIB,${{{nalias}}})]}} {{
}} else {{
	set SDCVAR(LIB,${{{nalias}}}) "0"
}}

if {{$SDCVAR(FL_STAGE) != "RTL" && !$SDCVAR(FL_STAGE) != "SYN"}} {{
    if {{$SDCVAR(IS_FLAT,${{{nalias}}}) && !$SDCVAR(LIB,${{{nalias}}})}} {{
        if {{[file exists $SDCVAR(DFT_DIR,${{{nalias}}}){blknm}_mbist.sdc]}} {{
            puts "SDC_INFO: Sourcing {blknm}_mbist.sdc."
            set IS_FLAT "1"
            set HIER "{sbhier}"
            source -echo -verbose $SDCVAR(DFT_DIR,${{{nalias}}}){blknm}_mbist.sdc
        }} else {{
            puts "SDC_ERROR: Missing {blknm}_mbist.sdc for integration. Please check it."
        }}
    }}
}}
'''
                        else:
                            varg += f'''
#############################################################
## Integration of {lalias}_{filekw}_intg.sdc
#############################################################
set {nalias} "{sbals}"
if {{[info exists SDCVAR(IS_FLAT,${{{nalias}}})]}} {{
}} else {{
	set SDCVAR(IS_FLAT,${{{nalias}}}) "1"
}}

if {{[info exists SDCVAR(LIB,${{{nalias}}})]}} {{
}} else {{
	set SDCVAR(LIB,${{{nalias}}}) "0"
}}

if {{$SDCVAR(IS_FLAT,${{{nalias}}}) && !$SDCVAR(LIB,${{{nalias}}})}} {{
	if {{[file exists $SDCVAR(SDC_DIR,${{{nalias}}})intg/{lalias}_{filekw}_intg.sdc]}} {{
		puts "SDC_INFO: Sourcing intg/{lalias}_{filekw}_intg.sdc."
		set SDCVAR(HIER,{plvl},${{{nalias}}}) "{sbhier}/"
		source -echo -verbose $SDCVAR(SDC_DIR,${{{nalias}}})intg/{lalias}_{filekw}_intg.sdc
	}} else {{
		puts "SDC_ERROR: Missing intg/{lalias}_{filekw}_intg.sdc for integration. Please check it."
	}}
}}

'''
                    
                    if len(bkals) > 1:
                        #xpt = bkals[0].split('_')[:-1]
                        #print(xpt)
                        #patval = '_'.join(xpt) +  f'_{nalias}_PAT'
                        #patval = bkals[0] + f'_{nalias}_NOMIM_PAT'
                        patval = bkals[0] + f'_NOMIM_PAT'
                        zpatval = f'''
set {patval}    [list \\
'''
                        for sbals,sbhier in zip(bkals,bkhier):
                        ## need write out patval
                            zpatval += f''' 
{sbals} {sbhier}/  \\                  
''' 
                        zpatval += f'''
]
'''
                        #print('NOMINM:',blknm,zpatval)
                        if type == 'mbist':
                            varg += f'''
#############################################################
## Integration of {blknm}_mbist.sdc
#############################################################
foreach {{ALIAS_VAL HIER_VAL}} ${patval} {{
	set {nalias} $ALIAS_VAL
	
	if {{[info exists SDCVAR(IS_FLAT,${{{nalias}}})]}} {{
	}} else {{
		set SDCVAR(IS_FLAT,${{{nalias}}}) "1"
	}}
	
	if {{[info exists SDCVAR(LIB,${{{nalias}}})]}} {{
	}} else {{
		set SDCVAR(LIB,${{{nalias}}}) "0"
	}}
	
    if {{$SDCVAR(FL_STAGE) != "RTL" && !$SDCVAR(FL_STAGE) != "SYN"}} {{
        if {{$SDCVAR(IS_FLAT,${{{nalias}}}) && !$SDCVAR(LIB,${{{nalias}}})}} {{
            if {{[file exists $SDCVAR(DFT_DIR,${{{nalias}}}){blknm}_mbist.sdc]}} {{
                puts "SDC_INFO: Sourcing {blknm}_mbist.sdc."
                set IS_FLAT "1"
                set HIER "$HIER_VAL"
                source -echo -verbose $SDCVAR(DFT_DIR,${{{nalias}}}){blknm}_mbist.sdc
            }} else {{
                puts "SDC_ERROR: Missing {blknm}_mbist.sdc for integration. Please check it."
            }}
        }}
    }}
}}
'''                        
                        else:      
                            varg += f'''
#############################################################
## Integration of {lalias}_{filekw}_intg.sdc
#############################################################
foreach {{ALIAS_VAL HIER_VAL}} ${patval} {{
	set {nalias} $ALIAS_VAL
	
	if {{[info exists SDCVAR(IS_FLAT,${{{nalias}}})]}} {{
	}} else {{
		set SDCVAR(IS_FLAT,${{{nalias}}}) "1"
	}}
	
	if {{[info exists SDCVAR(LIB,${{{nalias}}})]}} {{
	}} else {{
		set SDCVAR(LIB,${{{nalias}}}) "0"
	}}
	
	if {{$SDCVAR(IS_FLAT,${{{nalias}}}) && !$SDCVAR(LIB,${{{nalias}}})}} {{
		if {{[file exists $SDCVAR(SDC_DIR,{nalias})intg/{lalias}_{filekw}_intg.sdc]}} {{
			puts "SDC_INFO: Sourcing intg/{lalias}_{filekw}_intg.sdc."
			set SDCVAR(HIER,{plvl},${{{nalias}}}) "$HIER_VAL"
			source -echo -verbose $SDCVAR(SDC_DIR,{nalias})intg/{lalias}_{filekw}_intg.sdc
		}} else {{
			puts "SDC_ERROR: Missing intg/{lalias}_{filekw}_intg.sdc for integration. Please check it."
		}}
	}}
}}

'''                        
            

        # mim block with multi_lines
        if mlblks:
            for blknm in mlblks:
                blk = self.get_block_by_name(blknm)
                lvl = blk.hdlevel
                if lvl == 'sys':
                    plvl = 'SYS'
                else:
                    plvl = 'BLK'
                bkals,bkhier = self.get_hier_alias_hier(name,blknm)
                #print('hier_alias',blknm,bkals,bkhier)
                nalias = blk.alias
                lalias = blk.alias.lower()
                if bkals and bkhier:
                    #xpt = bkals[0].split('_')[:-1]
                    #print(xpt)
                    #patval = '_'.join(xpt) +  f'_{nalias}_MLMIM_PAT'
                    patval = bkals[0] +  f'_MLMIM_PAT'
                    zpatval = f'''
set {patval}    [list \\
'''
                    for sbals,sbhier in zip(bkals,bkhier):
                    ## need write out patval
                        zpatval += f''' 
{sbals} {sbhier}/  \\                  
''' 
                    zpatval += f'''
]
'''
                    #print('MLMIM:',blknm,zpatval)
                    if type == 'mbist':
                        varg += f'''
#############################################################
## Integration of {blknm}_mbist.sdc
#############################################################
foreach {{ALIAS_VAL HIER_VAL}} ${patval} {{
	set {nalias} $ALIAS_VAL
	
	if {{[info exists SDCVAR(IS_FLAT,${{{nalias}}})]}} {{
	}} else {{
		set SDCVAR(IS_FLAT,${{{nalias}}}) "1"
	}}
	
	if {{[info exists SDCVAR(LIB,${{{nalias}}})]}} {{
	}} else {{
		set SDCVAR(LIB,${{{nalias}}}) "0"
	}}

    if {{$SDCVAR(FL_STAGE) != "RTL" && !$SDCVAR(FL_STAGE) != "SYN"}} {{
        if {{$SDCVAR(IS_FLAT,${{{nalias}}}) && !$SDCVAR(LIB,${{{nalias}}})}} {{
            if {{[file exists $SDCVAR(DFT_DIR,${{{nalias}}}){blknm}_mbist.sdc]}} {{
                puts "SDC_INFO: Sourcing {blknm}_mbist.sdc."
                set IS_FLAT "1"
                set HIER "$HIER_VAL"
                source -echo -verbose $SDCVAR(DFT_DIR,${{{nalias}}}){blknm}_mbist.sdc
            }} else {{
                puts "SDC_ERROR: Missing {blknm}_mbist.sdc for integration. Please check it."
            }}
        }}
    }}
}}

'''
                    else:
                        varg += f'''
#############################################################
## Integration of {lalias}_{filekw}_intg.sdc
#############################################################
foreach {{ALIAS_VAL HIER_VAL}} ${patval} {{
	set {nalias} $ALIAS_VAL
	
	if {{[info exists SDCVAR(IS_FLAT,${{{nalias}}})]}} {{
	}} else {{
		set SDCVAR(IS_FLAT,${{{nalias}}}) "1"
	}}
	
	if {{[info exists SDCVAR(LIB,${{{nalias}}})]}} {{
	}} else {{
		set SDCVAR(LIB,${{{nalias}}}) "0"
	}}
	
	if {{$SDCVAR(IS_FLAT,${{{nalias}}}) && !$SDCVAR(LIB,${{{nalias}}})}} {{
		if {{[file exists $SDCVAR(SDC_DIR,{nalias})intg/{lalias}_{filekw}_intg.sdc]}} {{
			puts "SDC_INFO: Sourcing intg/{lalias}_{filekw}_intg.sdc."
			set SDCVAR(HIER,{plvl},${{{nalias}}}) "$HIER_VAL"
			source -echo -verbose $SDCVAR(SDC_DIR,{nalias})intg/{lalias}_{filekw}_intg.sdc
		}} else {{
			puts "SDC_ERROR: Missing intg/{lalias}_{filekw}_intg.sdc for integration. Please check it."
		}}
	}}
}}

'''

        # mim block with single_lines
        if slblks:
            for blknm in slblks:
                blk = self.get_block_by_name(blknm)
                lvl = blk.hdlevel
                if lvl == 'sys':
                    plvl = 'SYS'
                else:
                    plvl = 'BLK'
                bkals,bkhier = self.get_hier_alias_hier(name,blknm)
                #print('hier_alias',blknm,bkals,bkhier)
                nalias = blk.alias
                lalias = blk.alias.lower()              

                if bkals and bkhier:
                    for sbals,sbhier in zip(bkals,bkhier):
                        if type == 'mbist':
                            varg += f'''
#############################################################
## Integration of {blknm}_mbist.sdc
#############################################################
if {{[file exists $SDCVAR(DFT_DIR,{nalias}){blknm}_mbist.sdc]}} {{
	puts "SDC_INFO: Sourcing {blknm}_mbist.sdc."
'''
                        else:                          
                            varg += f'''
#############################################################
## Integration of {lalias}_{filekw}_intg.sdc
#############################################################
if {{[file exists $SDCVAR(SDC_DIR,{nalias})intg/{lalias}_{filekw}_intg.sdc]}} {{
	puts "SDC_INFO: Sourcing intg/{lalias}_{filekw}_intg.sdc."
'''
                        
                        als_pat = sbals.split('_')[-1]
                        nblkals = sbals.split(':')[0]
                        nblkhier = sbhier.split(':')[0]
                        #print('sbals:',sbals,'als_pat:',als_pat,)
                        
                        # VSPG${i}:i={1 8} or VSPG${i}:i={1 8 2} or VSPG${i}:i={1-3-6-7}
                        nals_patg = als_pat.split(':')
                        if len(nals_patg) == 2: 
                            nals_pat = nals_patg[1]           
                            varpat0 = re.findall('(\w+)=\{(\d+)\s+(\d+)\}',nals_pat)
                            varpat1 = re.findall('(\w+)=\{(\d+)\s+(\d+)\s+(\d+)\}',nals_pat)
                            # print('varpat0:',varpat0)
                            # print('varpat1:',varpat1)
                            if varpat0:
                                for cond in varpat0:
                                    varg += '\t' + f'for {{set {cond[0]} {cond[1]} }} {{ ${cond[0]} < {cond[2]} }} {{incr {cond[0]}}} {{\n'
                            if varpat1:
                                for cond in varpat1:
                                    varg += '\t' + f'for {{set {cond[0]} {cond[1]} }} {{ ${cond[0]} < {cond[2]} }} {{incr {cond[0]} {cond[3]}}} {{\n'

                            if '-' in nals_pat:
                                varpat2 = re.findall('(\w+)=\{(\S+)\}',nals_pat)
                                if varpat2:
                                    num_list =  re.sub('-', ' ', cond[1])
                                    varg += '\t' + f'set num_list_{cond[0]} "{num_list}"\n'
                                    varg += '\t' + f'foreach {cond[0]} $num_list_{cond[0]} {{\n'

                            if type == 'mbist':
                                varg += f'''
		set {nalias} "{nblkals}"
		if {{[info exists SDCVAR(IS_FLAT,{nalias})]}} {{
		}} else {{
			set SDCVAR(IS_FLAT,{nalias}) "1"
		}}
		
		if {{[info exists SDCVAR(LIB,{nalias})]}} {{
		}} else {{
			set SDCVAR(LIB,{nalias}) "0"
		}}

        if {{$SDCVAR(FL_STAGE) != "RTL" && !$SDCVAR(FL_STAGE) != "SYN"}} {{
            if {{$SDCVAR(IS_FLAT,{nalias}) && !$SDCVAR(LIB,{nalias})}} {{
                set IS_FLAT "1"
                set HIER "{nblkhier}"
                source -echo -verbose $SDCVAR(DFT_DIR,{nalias}){blknm}_mbist.sdc
            }}
        }}
	}} 
}} else {{
	puts "SDC_ERROR: Missing {blknm}_mbist.sdc for integration. Please check it."
}}

'''
                            else:                  
                                varg += f'''
		set {nalias} "{nblkals}"
		if {{[info exists SDCVAR(IS_FLAT,{nalias})]}} {{
		}} else {{
			set SDCVAR(IS_FLAT,{nalias}) "1"
		}}
		
		if {{[info exists SDCVAR(LIB,{nalias})]}} {{
		}} else {{
			set SDCVAR(LIB,{nalias}) "0"
		}}

		if {{$SDCVAR(IS_FLAT,{nalias}) && !$SDCVAR(LIB,{nalias})}} {{
			set SDCVAR(HIER,{plvl},${{{nalias}}}) "{nblkhier}/"
			source -echo -verbose $SDCVAR(SDC_DIR,{nalias})intg/{lalias}_{filekw}_intg.sdc
		}}
    }}
}} else {{
	puts "SDC_ERROR: Missing intg/{lalias}_{filekw}_intg.sdc for integration. Please check it."
}}

'''
                        
                        # MMPDG${i}${j}:i={0 4} j={0 4}:$i=$j
                        if len(nals_patg) == 3: 
                            nals_pat = nals_patg[1] 
                            ncon = nals_patg[2]
                            varpat3 = re.findall('(\S+)=\{(\d+) (\d+)}\s+(\S+)=\{(\d+) (\d+)}',nals_pat)
                            if varpat3:
                                for cond in varpat3:
                                    if type == 'mbist':
                                        varg += f'''
	for {{set {cond[0]} {cond[1]}}} {{${cond[0]} < {cond[2]}}} {{incr {cond[0]}}} {{
		for {{set {cond[3]} {cond[4]}}} {{${cond[3]} < {cond[5]}}} {{incr {cond[3]}}} {{
			if {{{ncon}}} {{     
                set {nalias} "{nblkals}"
                if {{[info exists SDCVAR(IS_FLAT,{nalias})]}} {{
                }} else {{
                    set SDCVAR(IS_FLAT,{nalias}) "1"
                }}
                
                if {{[info exists SDCVAR(LIB,{nalias})]}} {{
                }} else {{
                    set SDCVAR(LIB,{nalias}) "0"
                }}

                if {{$SDCVAR(FL_STAGE) != "RTL" && !$SDCVAR(FL_STAGE) != "SYN"}} {{
                    if {{$SDCVAR(IS_FLAT,{nalias}) && !$SDCVAR(LIB,{nalias})}} {{
                        set IS_FLAT "1"
                        set HIER "{nblkhier}"
                        source -echo -verbose $SDCVAR(DFT_DIR,{nalias}){blknm}_mbist.sdc
                    }}
                }}
            }}
        }}
    }}                            
}} else {{
    puts "SDC_ERROR: Missing {blknm}_mbist.sdc for integration. Please check it."
}}

'''
                                    else:                                    
                                        varg += f'''
	for {{set {cond[0]} {cond[1]}}} {{${cond[0]} < {cond[2]}}} {{incr {cond[0]}}} {{
		for {{set {cond[3]} {cond[4]}}} {{${cond[3]} < {cond[5]}}} {{incr {cond[3]}}} {{
			if {{{ncon}}} {{     
                set {nalias} "{nblkals}"
                if {{[info exists SDCVAR(IS_FLAT,{nalias})]}} {{
                }} else {{
                    set SDCVAR(IS_FLAT,{nalias}) "1"
                }}
                
                if {{[info exists SDCVAR(LIB,{nalias})]}} {{
                }} else {{
                    set SDCVAR(LIB,{nalias}) "0"
                }}

                if {{$SDCVAR(IS_FLAT,{nalias}) && !$SDCVAR(LIB,{nalias})}} {{
                    set SDCVAR(HIER,{plvl},${{{nalias}}}) "{nblkhier}/"
                    source -echo -verbose $SDCVAR(SDC_DIR,{nalias})intg/{lalias}_{filekw}_intg.sdc
                }} 
            }}
        }}
    }}                            
}} else {{
    puts "SDC_ERROR: Missing intg/{lalias}_{filekw}_intg.sdc for integration. Please check it."
}}

'''
        
        
        return varg


