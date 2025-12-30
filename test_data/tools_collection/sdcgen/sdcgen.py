
#! /usr/bin/env python
# _*_ coding:utf-8 _*_

"""
@ Author:
@ Copyright:
@ Description: top file for SDC/UPF flow generation
@ Version:
"""


import sys
import time
import os,re
import yaml
import json
import tkinter
import argparse

from os.path import dirname, abspath, basename
from glob import glob

import  openpyxl
from openpyxl.worksheet.datavalidation import DataValidation


#import upfgen as xupf
#import sdcgen as xsdc
from com.base import *
from com.hierpwr import *
from sdcgen.sdcdg import *
# from upfgen.upfdg import *

sys.path.insert(0, dirname(__file__))


# SDC_FILE_TYPES = ('VarDef', 'ClkDef', 'IODelay', 'IOExcpt', 'IntExcpt')
SDC_FILE_TYPES = ('VarDef', 'ClkDef', 'Exp')
# ORG_COMDIR = abspath(dirname(__file__)) + '/sdcgen/template/inputs/'
# UTEMP_DIR = abspath(dirname(__file__)) + '/sdcgen/template/USERTEMP/'


def sdcgen(*arglist):
    if len(arglist) == 0: arglist = ['-h']
    parser = argparse.ArgumentParser(prog='sdcgen', description='sdc generation script')
    # parser.add_argument('-temp', help='Write out template SDCs for reference.')
    parser.add_argument('-hier_yaml', help='Hier yaml file', default='./hier.yaml', required=False)
    parser.add_argument('-gen_dir', help='Top directory of the tree', default='.', metavar='GEN_DIR')
    parser.add_argument('-setup', help='setup directories for all blocks defined in hier yaml', action='store_true')
    parser.add_argument('-hier_block', help='Top hier block name for all of subblock generation')
    parser.add_argument('-blocks', help='Block list for sdc generation')
    parser.add_argument('-usr', help='User permission for sdc generation')
    #    parser.add_argument('-inc',         help='Include type of sdcs: ' + ', '.join(SDC_FILE_TYPES))
    # parser.add_argument('-dg', help='Write or update design guide files', action='store_true')
    parser.add_argument('-sdc', help='Write sdc files', action='store_true')
    parser.add_argument('-check_only', help='Check consistency before not generate sdc', action='store_true')
    parser.add_argument('-check_sdc', help='Check consistency after generate sdc', action='store_true')
    parser.add_argument('-proj', help='Open project mode. Maybe need set some related environment variable',
                        action='store_true')

    args = parser.parse_args(args=arglist)

    if args.setup:
        sdc_info('Create all of directory and copy template files such as vfile for the first step.')

    # if args.dg:
    #     sdc_info(
    #         'Generate initial design guide file based on current hier yaml, vfile and crgfile for the second step.')

    # if args.setup and args.dg:
    #     # sdc_info(f'Can use -setup and -dg frequently once hier yaml or vfile or pmfile or objfile updated before update guide table.')
    #     sdc_warn('Suggest Not use -setup and -dg together due to input files need update before -dg option.')

    # if args.dg and args.sdc:
    #     sdc_fatal('Option -dg and -sdc are mutually exclusive.')

    # if args.sdc and args.check_only:
    #     sdc_fatal(f'-sdc and -check_only are mutually exclusive')

    # if args.sdc and args.check_sdc_only:
    #     sdc_fatal(f'-sdc and -check_sdc_only are mutually exclusive')

    if args.proj:
        sdc_info('Open sdcgen in project mode as you specified')
    else:
        sdc_info('Open sdcgen in local mode as default')

    if not os.path.exists(args.hier_yaml):
        print(f'Hier yaml file {args.hier_yaml} does not exist')
        sdc_fatal(f'Hier yaml file {args.hier_yaml} does not exist')

    gen_dir = args.gen_dir
    if gen_dir == '.':
        gen_dir = './'
    hier_tree = HierPwrTree(args.hier_yaml)
    # hier_tree.top_dir = top_dir

    usr = args.usr
    # per_dvfs = False
    if usr == 'pro':
        sdc_info('User has profession permission.')
        prousr = True
    if usr == 'fre':
        sdc_info('User has free permission.')
        prousr = False

    if args.proj:
        hier_tree.proj = True
    else:
        hier_tree.proj = False

    if args.hier_block:
        topblk = [args.hier_block]
        block_list = hier_tree.get_lvlblks(topblk, outtype='hd')
    elif args.blocks:
        block_list = re.split(' +', args.blocks)
    else:
        block_list = None

    # for k,v in sorted(vars(args).items()):
    #     print(k,'=',v)

    # build basic directories and copy template files
    if args.setup:
        if block_list:
            for blk_name in block_list:
                # blk = hier_tree.get_block_by_name(blk_name)
                blk_alias = hier_tree.get_alias_by_name(blk_name)
                sdc_info(f'Setup directory for block {blk_name}')
                # os.makedirs(f'{gen_dir}/{blk_name}/sdc/inputs', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/sdcgen/inputs', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/sdc/inputs/mdblk', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/sdcgen/json', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/sdc/intg', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/sdc/outputs/blklib', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/sdcgen/outputs/expd', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/sdcgen/intg', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/sdcgen/logs', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/sdcgen/rpts', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/sdc/template', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/backup/sdc', exist_ok=True)

                # os.system(f'cp -rf {UTEMP_DIR}/* {gen_dir}/{blk_name}/sdc/template/.')

                # sdc_info(f'Copy template files such as vfile into inputs directory of {blk_name}')
                # if hier_tree.proj:
                #     vftemp = hier_tree.constr_dir + 'tmempty.v'
                # else:
                # vftemp = abspath(dirname(__file__) + '/sdcgen/template/inputs/tmempty.v')
                # vftemp = ORG_COMDIR + 'tmempty.v'
                # print(ORG_COMDIR,vftemp)
                # vfile = f'{gen_dir}/{blk_name}/sdc/inputs/{blk_name}.tmempty.v'
                # vfile = f'{gen_dir}/{blk_name}/sdc/inputs/vlog.v'
                # # time_stamp = time.strftime("%Y-%m-%d-%H-%M-%S", time.localtime())
                # if not os.path.exists(vfile):
                #     os.system(f'cp -f {vftemp} {vfile}')
                #     modify_line_in_file(vfile, 'module tmempty(', f'module {blk_name}(')
                #     sdc_info(
                #         f'Must add all of ports and IO related constraints in {vfile}. Must already finish this file according to template format before next step.')
                # else:
                    # os.makedirs(f'{gen_dir}/{blk_name}/sdc/inputs/backup/{time_stamp}', exist_ok=True)
                    # bakdir = abspath(dirname(vfile) + f'/backup/{time_stamp}/.')
                    # os.system(f'mv {vfile} {bakdir}')
                    # os.system(f'cp -f {vftemp} {vfile}')
                    # modify_line_in_file(vfile,'module empty(',f'module {blk_name}(')
                    # sdc_info(f'Must add all of ports and IO related constraints in {vfile}. Must already finish this file according to template format before next step.')
                    # sdc_info(f'Empty vfile already exists and confirm the correct vfile.')

                # sdc_info(f'Copy template files such as tune file into outputs directory of {blk_name}')
                # tftemp = abspath(dirname(__file__) + '/sdcgen/template/inputs/tune.sdc')
                # tftemp = ORG_COMDIR + 'tune.sdc'
                # tfile = f'{gen_dir}/{blk_name}/sdc/outputs/{blk_alias.lower()}_tune.sdc'
                # tfile = f'{gen_dir}/{blk_name}/sdc/outputs/tune.sdc'
                # if not os.path.exists(tfile):
                #     os.system(f'cp -f {tftemp} {tfile}')
                    # modify_line_in_file(tfile,'module tmempty(',f'module {blk_name}(')
                    # sdc_info(
                    #     f'Must add all of ports and IO related constraints in {vfile}. Must already finish this file according to template format before next step.')
                # else:
                #     sdc_info(f'Tune file already exists and confirm the correct tune file.')

                sdc_info(f'Build directory done for block {blk_name}')

                # generate original excel table based on existed input files including ****hier.yaml,vfile and crg/ip**** #


    # @1 check input data in inputs directory
    # @2 copy(not found) template table or backup table(exist) into inputs directory for block
    # @3 update template sheets such as VarDef, ClkDef, IODly, IOExp, IntExp from hier yaml, vfile, obj file, pmcell
    # @4 basic check based on data in sheets
    # @5 ****** dynamic or increment update guide table through comparision with old input files during -dg ******

    # if args.dg:
    #     # dg_temp = abspath(dirname(__file__) + '/sdcgen/template/inputs/SDC_Design_Guide.xlsx')
    #     dg_temp = ORG_COMDIR + 'SDC_Design_Guide.xlsx'
    #     # ORG_COMDIR = os.getenv('ECS_TEMPLATES_DIR')
    #     # dg_temp = os.path.join(ORG_COMDIR, 'dcont.xlsx')
    
    #     errs = 0
    #     wars = 0
    #     for blk_name in block_list:
    #         sdc_info(f'Generating SDC design guide file for {blk_name}.')
    #         blk_alias = hier_tree.get_alias_by_name(blk_name)
    
    #         sdc_info(f'Copy all of mac_insts and dig_insts into inputs directory if exists sdc.')
    #         cblk = hier_tree.get_block_by_name(blk_name)
    #         macdig = []
    #         if cblk.get_curdig_by_name():
    #             macdig.extend(cblk.get_curdig_by_name())
    #         if cblk.get_curmac_by_name():
    #             macdig.extend(cblk.get_curmac_by_name())
    #         # macdig = cblk.get_curdig_by_name() + cblk.get_curmac_by_name()
    #         if macdig:
    #             for mdblk in list(set(macdig)):
    #                 sblk = hier_tree.get_block_by_name(mdblk)
    #                 if sblk.constr_dir and os.path.exists(f'{sblk.constr_dir}{mdblk}.sdc'):
    #                     if hier_tree.proj:
    #                         os.system(f'cp -f {sblk.constr_dir}{mdblk}.sdc {gen_dir}/{blk_name}/sdc/inputs/mdblk/.')
    #                     else:
    #                         os.system(f'cp -f {ORG_COMDIR}{mdblk}.sdc {gen_dir}/{blk_name}/sdc/inputs/mdblk/.')
    
    #         # check vfile existence and get vfile data
    #         # vfile_data = {}
    #         vfile = f'{gen_dir}/{blk_name}/sdc/inputs/{blk_name}.tmempty.v'
    #         if not os.path.exists(vfile):
    #             sdc_error(f'Empty vfile not find {vfile}')
    #             errs = 1
    #         # else:
    #         #     vfile_data = read_vfile(vfile)
    
    #         # backup SDC design guide if exists
    #         dgfile = f'{gen_dir}/{blk_name}/sdc/inputs/SDC_Design_Guide.{blk_alias}.xlsx'
    #         dgfile = re.sub(r'/+', '/', dgfile)
    #         lock_file = f'{gen_dir}/{blk_name}/sdc/inputs/.~lock.SDC_Design_Guide.{blk_alias}.xlsx#'
    #         lock_file = re.sub(r'/+', '/', lock_file)
    #         time_stamp = time.strftime("%Y-%m-%d-%H-%M-%S", time.localtime())
    
    #         if os.path.exists(dgfile):
    #             os.makedirs(f'{gen_dir}/{blk_name}/sdc/inputs/backup/{time_stamp}', exist_ok=True)
    #             # dgfile_m = f'{gen_dir}/{blk_name}/sdc/inputs/backup/SDC_Design_Guide.{blk_alias}.{time_stamp}.xlsx'
    #             # dgfile_m = re.sub(f'SDC_Design_Guide.{blk_alias}.xlsx', dgfile_m, dgfile)
    #             bakdir = abspath(dirname(dgfile) + f'/backup/{time_stamp}/.')
    #             os.system(f'mv {dgfile} {bakdir}')
    #             os.system(f'cp -f {dg_temp} {dgfile}')
    #             sdc_info(
    #                 f'There has been a design guide file in inputs folder and backup it in inputs/backup/{time_stamp}')
    #             if os.path.exists(vfile):
    #                 os.system(f'cp -f {vfile} {bakdir}')
    #                 sdc_info(
    #                     f'There has been a empty vfile in inputs folder and backup it in inputs/backup/{time_stamp}')
    #             # if os.path.exists(pmfile):
    #             #     os.system(f'cp -f {pmfile} {bakdir}')
    #             #     sdc_info(f'There has been a pmcell file in inputs folder and backup it in inputs/backup/{time_stamp}')
    #             # if os.path.exists(objfile):
    #             #     os.system(f'cp -f {objfile} {bakdir}')
    #             #     sdc_info(f'There has been a objfile in inputs folder and backup it in inputs/backup/{time_stamp}')
    
    #             if os.path.exists(lock_file):
    #                 sdc_fatal('SDC_Design_Guide excel is in edit mode. Please close it')
    
    #         elif os.path.exists(dg_temp) and os.path.isfile(dg_temp):
    #             os.system(f'cp -f {dg_temp} {dgfile}')
    #             sdc_info(f'SDC design guide not found and copy from template design guide file at first time.')
    #         else:
    #             print('Not found the template of SDC design guide file.')
    #             exit(1)
    
    #             # tftemp = abspath(dirname(__file__) + '/sdcgen/template/inputs/tune.sdc')
    #         tftemp = ORG_COMDIR + 'tune.sdc'
    #         tfile = f'{gen_dir}/{blk_name}/sdc/outputs/{blk_alias.lower()}_tune.sdc'
    #         if not os.path.exists(tfile):
    #             sdc_info(f'Copy template files such as tune file into outputs directory of {blk_name}')
    #             os.system(f'cp -f {tftemp} {tfile}')
    #             # modify_line_in_file(tfile,'module tmempty(',f'module {blk_name}(')
    #             sdc_info(
    #                 f'Must add all of ports and IO related constraints in {vfile}. Must already finish this file according to template format before next step.')
    #         else:
    #             sdc_info(f'Tune file already exists and confirm the correct tune file.')
    
    #         sdcdg = SDC_DG()
    #         sdcdg.hier_tree = hier_tree
    
    #         sdcdg.read_vfile(vfile)
    #         if os.path.exists(dgfile):
    #             sdcdg.load_design_guide(dgfile)
    
    #         sdcdg.update_dg()
    #         sdcdg.save_workbook(dgfile)
    
    #         # sdcdg.change_dg()
    #         # sdcdg.save_workbook(dgfile)
    #         sdc_info(f'Design guide file {dgfile} is updated.')
    
    #         # check all different types of the correctness, completeness and consistency bet hier yaml, vfile/pmcell/objfile and dg file
    

    # after users fill requirements and before generate sdc files


    if args.check_only:
        pass

    # @1 after users fill in data, update hier yaml, backup sdc files
    # @2 parser all of sheets and inputs data, then check the correctness and consistency only from dg file
    # @3 store json data and write new sdc files
    if args.sdc:
        hier_tree.build_hier_tree(args.hier_yaml)

        for blk_name in block_list:
            time_stamp = time.strftime("%Y-%m-%d-%H-%M-%S", time.localtime())

            # os.makedirs(f'{gen_dir}/{blk_name}/backup/sdc', exist_ok=True)
            # if not os.path.exists(f'{gen_dir}/{blk_name}/backup/sdc/{time_stamp}'):
            #     os.system(f'mkdir {gen_dir}/{blk_name}/backup/sdc/{time_stamp}')
            # os.system(f'cp -rf {gen_dir}/{blk_name}/sdc/* {gen_dir}/{blk_name}/backup/sdc/{time_stamp}')
            # sdc_info(f'Copy all previous sdc files in {blk_name}/sdc to backup folder ...')

            # sdc_info(f'Generating current SDC file for {blk_name}')
            # sdc_dir = os.path.realpath(f'{gen_dir}/{blk_name}/sdc')
            # for root, dirs, files in os.walk(sdc_dir):
            #     if root == sdc_dir:
            #         for dir_name in dirs:
            #             pass
            #             # if dir_name != 'inputs':
            #             #     del_dir = f'{sdc_dir}/{dir_name}'
            #             #     os.system(f'rm -rf {del_dir}')
            #     elif root == f'{sdc_dir}/outputs/expd':
            #         for file_name in files:
            #             del_dir = f'{sdc_dir}/outputs/expd/{file_name}'
            #             os.system(f'rm -rf {del_dir}')
            #     # elif root == f'{sdc_dir}/outputs/blklib':
            #     #     for file_name in files:
            #     #         del_dir = f'{sdc_dir}/outputs/blklib/{file_name}'
            #     #         os.system(f'rm -rf {del_dir}')
            #     # elif root == f'{sdc_dir}/outputs':
            #     #     for file_name in files:
            #     #         del_file = f'{sdc_dir}/outputs/{file_name}'
            #     #         if not del_file.endswith('_tune.sdc'):
            #     #             os.system(f'rm -f {del_file}')
            #
            #     elif root == f'{sdc_dir}/json':
            #         for file_name in files:
            #             del_file = f'{sdc_dir}/json/{file_name}'
            #             os.system(f'rm -f {del_file}')
            #     elif root == f'{sdc_dir}/logs':
            #         for file_name in files:
            #             del_file = f'{sdc_dir}/logs/{file_name}'
            #             os.system(f'rm -f {del_file}')
            #     elif root == f'{sdc_dir}/rpts':
            #         for file_name in files:
            #             del_file = f'{sdc_dir}/rpts/{file_name}'
            #             os.system(f'rm -f {del_file}')
            #     # elif root == f'{sdc_dir}/outputs/intg':
            #     #     for file_name in files:
            #     #         del_file = f'{sdc_dir}/outputs/intg/{file_name}'
            #     #         if not del_file.endswith('_tune_intg.sdc'):
            #     #             os.system(f'rm -f {del_file}')
            # sdc_info(f'Deleted all files for block {blk_name} ...')

            sdclog = f'{gen_dir}/{blk_name}/sdcgen/logs/sdcgen.log'
            printlog('SDC_INO: Start Generating SDC files----', sdclog)

            sdc_info(f'Start generating current SDC file for {blk_name}')
            blk_alias = hier_tree.get_alias_by_name(blk_name)
            # dgfile = f'{gen_dir}/{blk_name}/sdc/inputs/SDC_Design_Guide.{blk_alias}.xlsx'
            # dgfile = f'{gen_dir}/{blk_name}/sdc/inputs/dcont.xlsx'
            dgfile = os.path.join(f'{gen_dir}',f'{blk_name}',"sdcgen","inputs","dcont.xlsx")
            # dgfile = re.sub(r'/+', '/', dgfile)
            sdcdg = SDC_DG()
            sdcdg.hier_tree = hier_tree

            # vfile = f'{gen_dir}/{blk_name}/sdc/inputs/{blk_name}.tmempty.v'
            # vfile = f'{gen_dir}/{blk_name}/sdc/inputs/vlog.v'
            vfile = os.path.join(f'{gen_dir}', f'{blk_name}', "sdcgen", "inputs", "vlog.v")
            sdcdg.read_vfile(vfile, 'json')

            if os.path.exists(dgfile):
                sdcdg.load_design_guide(dgfile, 'json')

            sdcdg.check_dg()
            sdcdg.write_sdc_files(prousr)
            sdc_info(f'Finish generating current SDC file for {blk_name}')

    # check all different types of the correctness, completeness and consistency bet hier yaml, vfile/pmcell/objfile and dg file
    # after generate sdc files
    if args.check_sdc:
        pass


if __name__ == '__main__':
    if len(sys.argv) < 2 or (len(sys.argv) > 2 and 'sdcgen' not in sys.argv[1]):
        sdc_error('Missing some parameters for SDC generation')
        locals()['sdcgen']('-h')
        exit(1)
    app_name = sys.argv[1]
    if app_name in locals():
        locals()[app_name](*sys.argv[2:])
    else:
        raise NameError(f'The application of DataBase generation {app_name} not found')




