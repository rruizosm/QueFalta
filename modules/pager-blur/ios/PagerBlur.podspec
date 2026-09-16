Pod::Spec.new do |s|
  s.name = 'PagerBlur'
  s.version = '1.0.0'
  s.summary = 'Native pager backdrop blur controlled by Reanimated'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'QuéFalta'
  s.homepage = 'https://github.com/rruizosm/QueFalta'
  s.source = { :git => 'https://github.com/rruizosm/QueFalta.git' }
  s.platform = :ios, '16.4'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
