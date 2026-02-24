fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'cad_bridge'
author 'CAD Team'
description 'Bridge between CAD and FiveM/QBox'
version '0.1.0'

shared_script 'config.lua'
client_scripts {
  'client/modules/shared.lua',
  'client/modules/jail.lua',
  'client/modules/license.lua',
  'client/modules/registration.lua',
  'client/modules/documents_ui.lua',
  'client/modules/peds.lua',
  'client/modules/call_popup.lua',
}
server_script 'server.lua'

ui_page 'ui/index.html'

files {
  'config.cfg',
  'client/modules/*.lua',
  'ui/index.html',
  'ui/license-card.html',
  'ui/styles.css',
  'ui/app.js',
  'ui/vendor/pdf.min.js',
  'ui/overlay.webp',
  'ui/vicroads-logo.png',
}
