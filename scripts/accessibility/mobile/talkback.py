"""Collect the real Android packages before running the speech and gesture journeys."""
from pathlib import Path
import subprocess
out=Path('test-output/mobile-access')
def adb(*args):
    return subprocess.run(['adb',*args],capture_output=True,text=True,check=True).stdout.strip()
packages=adb('shell','pm','list','packages')
if 'package:com.android.chrome' not in packages:
    raise SystemExit("The official Android image does not include Chrome.")
if 'package:com.google.android.marvin.talkback' not in packages:
    raise SystemExit("This Google Play system image does not include TalkBack. No speech test was claimed.")
print(adb('shell','cmd','package','query-services','--brief','-a','android.accessibilityservice.AccessibilityService'))
print('Package inventory complete. No spoken assertion in this discovery run.')
