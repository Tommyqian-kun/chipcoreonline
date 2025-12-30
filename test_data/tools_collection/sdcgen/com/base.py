

import json
import os
import re
import sys
from os.path import dirname
import time

import yaml
#from itertools import chain

# from openpyxl import worksheet 
# from pprint import pprint 
# import pandas as pd
# from openpyxl.utils import get_column_letter 

# import tkinter as tk


def modify_line_in_file(file_path, search_pattern, replacement):
    # 打开文件并逐行读取内容
    with open(file_path, 'r') as file:
        lines = file.readlines()

    # 遍历每一行并进行匹配和替换
    modified_lines = []
    for line in lines:
        if search_pattern in line:
            modified_line = line.replace(search_pattern, replacement)
            modified_lines.append(modified_line)
        else:
            modified_lines.append(line)

    # 将修改后的内容写回文件
    with open(file_path, 'w') as file:
        file.writelines(modified_lines)


def printlog(context,file='./'):
    with open(file, 'w') as fw:
        fw.write(context)

# upf meesage
upf_message_list =  []
def upf_log(level, msg, out=sys.stdout):
    print(f'{level.upper()}: {msg}', flush=True, file=out)

def upf_info(msg):
    if msg not in upf_message_list:
        upf_message_list.append(msg)
        upf_log('UPF_INFO', msg)

def upf_warn(msg):
    if msg not in upf_message_list:
         upf_message_list.append(msg)
         print(f'\033[0:31mUPF_WARN\033[0m: {msg}', flush=True)

def upf_error(msg):
    if msg not in upf_message_list:
         upf_message_list.append(msg)
         print(f'\033[0:31mUPF_ERROR\033[0m: {msg}', flush=True)

def upf_fatal(msg):
    if msg not in upf_message_list:
         upf_message_list.append(msg)
         print(f'\033[0:31mUPF_FATAL\033[0m: {msg}', flush=True)    
           
    sys.exit(1) 

# sdc message
sdc_message_list =  []
def sdc_log(level, msg, out=sys.stdout):
    print(f'{level.upper()}: {msg}', flush=True, file=out)

def sdc_info(msg):
    if msg not in sdc_message_list:
        sdc_message_list.append(msg)
        sdc_log('SDC_INFO', msg)

def sdc_warn(msg):
    if msg not in sdc_message_list:
         sdc_message_list.append(msg)
         print(f'\033[0:31mSDC_WARN\033[0m: {msg}', flush=True)

def sdc_error(msg):
    if msg not in sdc_message_list:
         sdc_message_list.append(msg)
         print(f'\033[0:31mSDC_ERROR\033[0m: {msg}', flush=True)

def sdc_fatal(msg):
    if msg not in sdc_message_list:
         sdc_message_list.append(msg)
         print(f'\033[0:31mSDC_FATAL\033[0m: {msg}', flush=True)    
           
    sys.exit(1)        