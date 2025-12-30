

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
# from sdcgen.sdcdg import *
from upfgen.upfdg import *

sys.path.insert(0, dirname(__file__))

UPF_FILE_TYPES = ('VarDef', 'PDomain', 'PStrategy', 'PMode')
SDC_FILE_TYPES = ('VarDef', 'ClkDef', 'IODelay', 'IOExcpt', 'IntExcpt')
# ORG_COMDIR = abspath(dirname(__file__)) + '/sdcgen/template/inputs/'
# UTEMP_DIR = abspath(dirname(__file__)) + '/sdcgen/template/USERTEMP/'



#########################################################################################################
def upfgen(*arglist):
    if len(arglist) == 0: arglist = ['-h']
    parser = argparse.ArgumentParser(prog='upfgen', description='upf generation script')
    # parser.add_argument('-temp', help='Write out template UPFs for reference.')
    parser.add_argument('-hier_yaml', help='Hier yaml file', default='./hier.yaml', required=False)
    parser.add_argument('-gen_dir', help='Top directory of the tree', default='.', metavar='GEN_DIR')
    parser.add_argument('-setup', help='setup directories for all blocks defined in hier yaml', action='store_true')
    parser.add_argument('-hier_block', help='Top hier block name for all of subblock generation')
    parser.add_argument('-blocks', help='Block list for upf generation')
    parser.add_argument('-usr', help='User permission for upf generation')
    #    parser.add_argument('-inc',         help='Include type of upfs: ' + ', '.join(UPF_FILE_TYPES))
    # parser.add_argument('-dg', help='Write or update design guide files', action='store_true')
    parser.add_argument('-upf', help='Write upf files', action='store_true')
    parser.add_argument('-check_only', help='Check consistency before not generate upf', action='store_true')
    parser.add_argument('-check_upf', help='Check consistency after generate upf', action='store_true')
    parser.add_argument('-proj', help='Open project mode. Maybe need set some related environment variable',
                        action='store_true')

    args = parser.parse_args(args=arglist)

    if args.setup:
        upf_info(
            f'Create all of directory and copy template files such as vfile, pmfile and objfile for the first step.')

    # if args.dg:
    #     upf_info(
    #         f'Generate initial design guide file based on current hier yaml, vfile, pmfile and objfile for the second step.')
    #
    # if args.setup and args.dg:
    #     # upf_info(f'Can use -setup and -dg frequently once hier yaml or vfile or pmfile or objfile updated before update guide table.')
    #     upf_warn(f'Suggest Not use -setup and -dg together due to input files need update before -dg option.')
    #
    # if args.dg and args.upf:
    #     upf_fatal(f'Option -dg and -upf are mutually exclusive.')

    # if args.upf and args.check_only:
    #     upf_fatal(f'-upf and -check_only are mutually exclusive')

    # if args.upf and args.check_upf_only:
    #     upf_fatal(f'-upf and -check_upf_only are mutually exclusive')

    if args.proj:
        upf_info('Open upfgen in project mode as you specified')
    else:
        upf_info('Open upfgen in local mode as default')

    if not os.path.exists(args.hier_yaml):
        upf_fatal(f'Hier yaml file {args.hier_yaml} does not exist')

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
                upf_info(f'Setup directory for block {blk_name}')
                os.makedirs(f'{gen_dir}/{blk_name}/upfgen/inputs', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/upfgen/inputs/backup', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/upfgen/json', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/upfgen/intg', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/sdc/outputs/blklib', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/upfgen/outputs/expd', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/upfgen/intg', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/upfgen/logs', exist_ok=True)
                os.makedirs(f'{gen_dir}/{blk_name}/upfgen/rpts', exist_ok=True)
                # os.makedirs(f'{gen_dir}/{blk_name}/backup/upf', exist_ok=True)

                # upf_info(
                #     f'Copy template files such as vfile, obj file, pmcell file into inputs directory of {blk_name}')
                # vftemp = abspath(dirname(__file__) + '/upfgen/template/pmempty.v')
                # vfile = f'{gen_dir}/{blk_name}/upfgen/inputs/{blk_name}.pmempty.v'
                # if not os.path.exists(vfile):
                #     os.system(f'cp -f {vftemp} {vfile}')
                #     modify_line_in_file(vfile, 'module pmempty(', f'module {blk_name}(')
                #     upf_info(
                #         f'Must add power related infos such as supply ports, supply voltage and control signals in {vfile}. Must already finish this file according to template format before next step.')
                # else:
                #     upf_info(f'Empty vfile already exists in {blk_name}')
                #
                # pmtemp = abspath(dirname(__file__) + '/upfgen/template/pmcell.yaml')
                # pmfile = f'{gen_dir}/{blk_name}/upfgen/inputs/{blk_name}.pmcell.yaml'
                # if not os.path.exists(pmfile):
                #     os.system(f'cp -f {pmtemp} {pmfile}')
                #     upf_info(
                #         f'Must confirm and modify ISO/LS/ELS/RET/PSW pmcells infos according to process library in {pmfile}. Must already finish this file according to template format before next step.')
                # else:
                #     upf_info(f'Pmfile already exists in {blk_name}')
                #
                # objtemp = abspath(dirname(__file__) + '/upfgen/template/pmobj.tcl')
                # objfile = f'{gen_dir}/{blk_name}/upfgen/inputs/{blk_name}.pmobj.tcl'
                # if not os.path.exists(objfile):
                #     os.system(f'cp -f {objtemp} {objfile}')
                #     upf_info(
                #         f'Needs add design object infos according to different power supply connection in {objfile}. Need already finish this file according to template format before next step if power intent is clear.')
                # else:
                #     upf_info(f'Objfile already exists in {blk_name}')

                upf_info(f'Build directory done for block {blk_name}')

                # generate original excel table based on existed input files #
    # @1 check input data in inputs directory
    # @2 copy(not found) template table or backup table(exist) into inputs directory for block
    # @3 update template sheets such as VarDef, PDomain, PStrategy, PMode from hier yaml, vfile, obj file, pmcell
    # @4 basic check based on data in sheets
    # @5 ****** dynamic or increment update guide table through comparision with old input files during -dg ******
    # if args.dg:
    #     dg_temp = abspath(dirname(__file__) + '/upfgen/template/UPF_Design_Guide.xlsx')
    #     # print(dg_temp)
    #
    #     errs = 0
    #     wars = 0
    #     for blk_name in block_list:
    #         upf_info(f'Generating UPF design guide file for {blk_name}.')
    #
    #         blk_alias = hier_tree.get_alias_by_name(blk_name)
    #
    #         # check vfile existence and get vfile data
    #         # vfile_data = {}
    #         vfile = f'{gen_dir}/{blk_name}/upfgen/inputs/{blk_name}.pmempty.v'
    #         if not os.path.exists(vfile):
    #             upf_error(f'Empty vfile not find {vfile}')
    #             errs = 1
    #         # else:
    #         #     vfile_data = read_vfile(vfile)
    #
    #         # check pmcell existence andget pmcell data
    #         # pmfile_data = {}
    #         pmfile = f'{gen_dir}/{blk_name}/upfgen/inputs/{blk_name}.pmcell.yaml'
    #         if not os.path.exists(pmfile):
    #             upf_error(f'PMcell file not find {pmfile}')
    #             errs = 1
    #             # else:
    #         #     pmfile_data = read_pmfile(pmfile)
    #
    #         if errs > 0:
    #             upf_fatal('Please fix missing input vfile or pmcell files above.')
    #
    #         # check obj file existence and get obj data
    #         # objfile_data = {}
    #         objfile = f'{gen_dir}/{blk_name}/upfgen/inputs/{blk_name}.pmobj.tcl'
    #         if not os.path.exists(objfile):
    #             upf_warn(f'PMobj file not find {objfile}')
    #             wars = 1
    #             # else:
    #         #     objfile_data = read_objfile(objfile)
    #
    #         if wars > 0:
    #             upf_warn('Please check missing input files above.')
    #
    #         # backup UPF design guide if exists
    #         dgfile = f'{gen_dir}/{blk_name}/upfgen/inputs/UPF_Design_Guide.{blk_alias}.xlsx'
    #         dgfile = re.sub(r'/+', '/', dgfile)
    #         lock_file = f'{gen_dir}/{blk_name}/upfgen/inputs/.~lock.UPF_Design_Guide.{blk_alias}.xlsx#'
    #         lock_file = re.sub(r'/+', '/', lock_file)
    #         time_stamp = time.strftime("%Y-%m-%d-%H-%M-%S", time.localtime())
    #
    #         if os.path.exists(dgfile):
    #             os.makedirs(f'{gen_dir}/{blk_name}/upfgen/inputs/backup/{time_stamp}', exist_ok=True)
    #             # dgfile_m = f'{gen_dir}/{blk_name}/upfgen/inputs/backup/UPF_Design_Guide.{blk_alias}.{time_stamp}.xlsx'
    #             # dgfile_m = re.sub(f'UPF_Design_Guide.{blk_alias}.xlsx', dgfile_m, dgfile)
    #             bakdir = abspath(dirname(dgfile) + f'/backup/{time_stamp}/.')
    #             # print(bakdir)
    #             os.system(f'mv {dgfile} {bakdir}')
    #             os.system(f'cp -f {dg_temp} {dgfile}')
    #             upf_info(
    #                 f'There has been a design guide file in inputs folder and backup it in inputs/backup/{time_stamp}')
    #             if os.path.exists(vfile):
    #                 os.system(f'cp -f {vfile} {bakdir}')
    #                 upf_info(
    #                     f'There has been a empty vfile in inputs folder and backup it in inputs/backup/{time_stamp}')
    #             if os.path.exists(pmfile):
    #                 os.system(f'cp -f {pmfile} {bakdir}')
    #                 upf_info(
    #                     f'There has been a pmcell file in inputs folder and backup it in inputs/backup/{time_stamp}')
    #             if os.path.exists(objfile):
    #                 os.system(f'cp -f {objfile} {bakdir}')
    #                 upf_info(f'There has been a objfile in inputs folder and backup it in inputs/backup/{time_stamp}')
    #
    #             if os.path.exists(lock_file):
    #                 upf_fatal('UPF_Design_Guide excel is in edit mode. Please close it')
    #
    #         elif os.path.exists(dg_temp) and os.path.isfile(dg_temp):
    #             os.system(f'cp -f {dg_temp} {dgfile}')
    #             upf_info(f'UPF design guide not found and copy from template design guide file at first time.')
    #         else:
    #             print('Not found the template of UPF design guide file.')
    #             exit(1)
    #
    #         upfdg = XupfDesignGuide()
    #         upfdg.hier_tree = hier_tree
    #
    #         # if args.proj:
    #         #     upfdg.proj = True
    #
    #         upfdg.read_vfile(vfile)
    #         upfdg.read_pmfile(pmfile)
    #         upfdg.read_objfile(objfile)
    #
    #         if os.path.exists(dgfile):
    #             upfdg.load_design_guide(dgfile)
    #
    #         # upfdg.read_vfile(vfile)
    #         # upfdg.read_pmfile(pmfile)
    #         # upfdg.read_objfile(objfile)
    #
    #         upfdg.update_dg()
    #         upfdg.save_workbook(dgfile)
    #
    #         # upfdg.change_dg()
    #         # upfdg.save_workbook(dgfile)
    #         upf_info(f'Design guide file {dgfile} is updated.')
    #
    #         # check all different types of the correctness, completeness and consistency bet hier yaml, vfile/pmcell/objfile and dg file
    #


    # after users fill requirements and before generate upf files

    if args.check_only:
        pass

    # @1 after users fill in data, update hier yaml, backup upf files
    # @2 parser all of sheets and inputs data, then check the correctness and consistency only from dg file
    # @3 store json data and write new upf files
    if args.upf:

        hier_tree.build_hier_tree(args.hier_yaml)

        for blk_name in block_list:

            time_stamp = time.strftime("%Y-%m-%d-%H-%M-%S", time.localtime())
            # if not os.path.exists(f'{gen_dir}/{blk_name}/backup/upfgen/{time_stamp}'):
            #     os.system(f'mkdir {gen_dir}/{blk_name}/backup/upfgen/{time_stamp}')
            # os.system(f'cp -rf {gen_dir}/{blk_name}/upfgen/* {gen_dir}/{blk_name}/backup/upfgen/{time_stamp}')
            # upf_info(f'Copy all previous upf files in {blk_name}/upf to backup folder ...')

            # upf_info(f'Generating current UPF file for {blk_name}')
            # upf_dir = os.path.realpath(f'{gen_dir}/{blk_name}/upf')
            # for root, dirs, files in os.walk(upf_dir):
            #     if root == upf_dir:
            #         for dir_name in dirs:
            #             if dir_name != 'inputs':
            #                 del_dir = f'{upf_dir}/{dir_name}'
            #                 os.system(f'rm -rf {del_dir}')
            #     elif root == f'{upf_dir}/outputs':
            #         for dir_name in dirs:
            #             if dir_name != 'intg':
            #                 del_dir = f'{upf_dir}/outputs/{dir_name}'
            #                 os.system(f'rm -rf {del_dir}')
            #         for file_name in files:
            #             del_file = f'{upf_dir}/outputs/{file_name}'
            #             if not del_file.endswith('_tune.upf'):
            #                 os.system(f'rm -f {del_file}')
            #     elif root == f'{upf_dir}/outputs/intg':
            #         for file_name in files:
            #             del_file = f'{upf_dir}/outputs/intg/{file_name}'
            #             if not del_file.endswith('_tune_intg.upf'):
            #                 os.system(f'rm -f {del_file}')
            # upf_info(f'Deleted all files for block {blk_name} ...')

            upf_info(f'Start generating current UPF file for {blk_name}')
            # blk_alias = hier_tree.get_alias_by_name(blk_name)
            dgfile = f'{gen_dir}/{blk_name}/upfgen/inputs/pcont.xlsx'
            # dgfile = re.sub(r'/+', '/', dgfile)
            upfdg = UPFDG()
            upfdg.hier_tree = hier_tree

            vfile = f'{gen_dir}/{blk_name}/upfgen/inputs/pvlog.v'
            upfdg.read_vfile(vfile, 'json')

            # pmfile = f'{gen_dir}/{blk_name}/upfgen/inputs/pcell.yaml'
            # upfdg.read_pmfile(pmfile, 'json')

            objfile = f'{gen_dir}/{blk_name}/upfgen/inputs/pobj.tcl'
            upfdg.read_objfile(objfile, 'json')

            if os.path.exists(dgfile):
                upfdg.load_design_guide(dgfile, 'json')

            upfdg.check_dg()

            upfdg.write_upf_files(gen_dir)

            upf_info(f'Finish generating current UPF file for {blk_name}')

    # check all different types of the correctness, completeness and consistency bet hier yaml, vfile/pmcell/objfile and dg file
    # after generate upf files
    if args.check_upf:
        pass


if __name__ == '__main__':
    if len(sys.argv) < 2 or (len(sys.argv) > 2 and 'upfgen' not in sys.argv[1]):
        sdc_error('Missing some parameters for UPF generation')
        locals()['upfgen']('-h')
        exit(1)
    app_name = sys.argv[1]
    if app_name in locals():
        locals()[app_name](*sys.argv[2:])
    else:
        raise NameError(f'The application of DataBase generation {app_name} not found')

