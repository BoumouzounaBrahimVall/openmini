require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "OpenminiReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/openmini/openmini"
  s.license      = "Apache-2.0"
  s.authors      = "OpenMini contributors"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/openmini/openmini.git", :tag => s.version }
  s.source_files = "ios/**/*.{h,m,swift}"
  s.swift_version = "5.9"
  install_modules_dependencies(s)
end
