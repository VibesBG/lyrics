"""Builds ../index.html from template.html + core.js + example.json (public page, no private lyrics).
Usage: py -I src/build.py"""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
read = lambda f: open(os.path.join(D, f), encoding='utf8').read()
example = json.dumps(json.loads(read('example.json')), ensure_ascii=False, separators=(',', ':')).replace('</', r'<\/')
t = read('template.html').replace('/*__CORE__*/', read('core.js')).replace('__EXAMPLE__', example)
open(os.path.join(D, '..', 'index.html'), 'w', encoding='utf8', newline='\n').write(t)
print('wrote index.html')
