"""Imported actions remain inert until explicitly confirmed."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

@unittest.skipUnless(shutil.which("node"), "Node required")
class ImportedActionTests(unittest.TestCase):
    def test_import_preserves_content_and_does_not_run_broadcast(self):
        script = r''' 
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {projectsMixin} from './custom_components/dratek_eink/frontend/panel/panel-projects.mixin.js';
import {brandLogoMixin} from './custom_components/dratek_eink/frontend/panel/panel-brand-logo.mixin.js';
import {DISPLAY_TEMPLATE_CATALOG} from './custom_components/dratek_eink/frontend/panel/templates/index.js';
let saved, calls=0;
const p=Object.assign({}, projectsMixin, brandLogoMixin, {
 _render(){}, _paint(){}, _hass:{callWS(){calls++;}},
 async _saveUserDisplayTemplate(t){saved=t;},
 _displayTemplateCards(){return saved?[saved]:[];},
 _result:{devices:[{address:'AA'}]},
});
globalThis.alert=()=>{};
await p._importDisplayTemplateFile({text:async()=>fs.readFileSync('examples/dratek-hromadna.dratek-template.json','utf8')});
assert.equal(saved.action,'dratek_logo_broadcast');
assert.equal(calls,0);
assert.equal(p._brandLogoTemplateCard().id,'dratek_logo');
assert.ok(DISPLAY_TEMPLATE_CATALOG.some(t=>t.id==='dratek_logo'));
globalThis.confirm=()=>false;
await p._broadcastBrandLogoToAllDisplays();
assert.equal(calls,0);
await p._importDisplayTemplateFile({text:async()=>JSON.stringify({title:'Legacy',elements:[{type:'text',text:'Test'}]})});
assert.equal(saved.editor_elements[0].text,'Test');
assert.equal(p._brandLogoTemplateCard().id,'dratek_logo');
'''
        result = subprocess.run([shutil.which("node"), "--input-type=module", "-e", script], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(0, result.returncode, result.stderr)
