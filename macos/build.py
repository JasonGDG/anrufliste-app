from pathlib import Path
import plistlib,shutil,subprocess
root=Path(__file__).resolve().parent.parent
out=root/'build'/'macos'
app=out/'Anrufliste.app'
if out.exists():shutil.rmtree(out)
resources=app/'Contents'/'Resources'
(resources/'app').mkdir(parents=True)
(app/'Contents'/'MacOS').mkdir()
for name in ['bin','public','skill']:shutil.copytree(root/name,resources/'app'/name)
for name in ['package.json','LICENSE']:shutil.copy(root/name,resources/'app'/name)
for name in ['bootstrap.sh','runtimes.json']:shutil.copy(root/'macos'/name,resources/name)
with (app/'Contents'/'Info.plist').open('wb') as f:
 plistlib.dump({'CFBundleName':'Anrufliste','CFBundleDisplayName':'Anrufliste','CFBundleIdentifier':'com.aiforeu.anrufliste','CFBundleExecutable':'Anrufliste','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.2.0','CFBundleVersion':'2','LSMinimumSystemVersion':'12.0','NSHighResolutionCapable':True},f)
for arch in ['arm64','x86_64']:
 subprocess.run(['/usr/bin/swiftc',str(root/'macos'/'Launcher.swift'),'-O','-target',arch+'-apple-macosx12.0','-o',str(out/arch)],check=True)
subprocess.run(['/usr/bin/lipo','-create',str(out/'arm64'),str(out/'x86_64'),'-output',str(app/'Contents'/'MacOS'/'Anrufliste')],check=True)
subprocess.run(['/usr/bin/codesign','--force','--sign','-','--deep',str(app)],check=True)
subprocess.run(['/usr/bin/ditto','-c','-k','--keepParent',str(app),str(out/'Anrufliste-Mac.zip')],check=True)
print(out/'Anrufliste-Mac.zip')
