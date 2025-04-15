__version__ = '0.17.2'
git_version = 'c1d70fe1aa3f37ecdc809311f6c238df900dfd19'
from torchvision.extension import _check_cuda_version
if _check_cuda_version() > 0:
    cuda = _check_cuda_version()
