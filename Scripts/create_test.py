import requests

# Basic Information:
# Options must contain 'Threads={} Hash={}'
# test_mode may be 'SPRT' or 'GAMES'
# Networks are assigned by SHA256 (8 hex chars); use '' for no network
# Syzygy settings are OPTIONAL / DISABLED / N-MAN
# auto_schedule: NONE, a preset name (e.g. LTC), or RESCHEDULE

URL = 'https://ob.kjljixx.com/scripts/'

data = {

    'username' : '',
    'password' : '',
    'action'   : 'CREATE_TEST',

    'workload_name' : '',

    'dev_engine'       : '',
    'dev_repo'         : '',
    'dev_branch'       : '',
    'dev_bench'        : 'Autofill',
    'dev_network'      : '',
    'dev_options'      : 'Threads=1 Hash=8',
    'dev_time_control' : '',

    'base_engine'       : '',
    'base_repo'         : '',
    'base_branch'       : '',
    'base_bench'        : 'Autofill',
    'base_network'      : '',
    'base_options'      : 'Threads=1 Hash=8',
    'base_time_control' : '',

    'book_name'  : '',
    'upload_pgns': 'FALSE',
    'info'       : '',

    'test_mode'       : 'SPRT',
    'test_bounds'     : '[0.00, 3.00]',
    'test_confidence' : '[0.05, 0.05]',
    'test_max_games'  : '0',

    'priority'      : '0',
    'throughput'    : '1000',
    'workload_size' : '32',
    'auto_schedule' : 'NONE',

    'scale_method' : 'BASE',
    'scale_nps'    : '',

    'syzygy_wdl' : 'OPTIONAL',
    'syzygy_adj' : 'OPTIONAL',
    'win_adj'    : 'movecount=3 score=400',
    'draw_adj'   : 'movenumber=40 movecount=8 score=10',
}

r = requests.post(URL, data=data)
print(r.status_code, r.json())
