import Foundation
import AVFoundation
import AppKit
import ImageIO

let base=URL(fileURLWithPath:CommandLine.arguments[1],isDirectory:true)
let silent=base.appendingPathComponent("silent-master.mov")
let output=base.appendingPathComponent("quefalta-brand-film-10s.mp4")
for u in [silent,output] {try? FileManager.default.removeItem(at:u)}
let writer=try AVAssetWriter(outputURL:silent,fileType:.mov)
let settings:[String:Any]=[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:1080,AVVideoHeightKey:1920,AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:22_000_000,AVVideoExpectedSourceFrameRateKey:60,AVVideoMaxKeyFrameIntervalKey:60,AVVideoProfileLevelKey:AVVideoProfileLevelH264HighAutoLevel],AVVideoColorPropertiesKey:[AVVideoColorPrimariesKey:AVVideoColorPrimaries_ITU_R_709_2,AVVideoTransferFunctionKey:AVVideoTransferFunction_ITU_R_709_2,AVVideoYCbCrMatrixKey:AVVideoYCbCrMatrix_ITU_R_709_2]]
let input=AVAssetWriterInput(mediaType:.video,outputSettings:settings)
input.expectsMediaDataInRealTime=false
let attrs:[String:Any]=[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:1080,kCVPixelBufferHeightKey as String:1920,kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true]
let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:attrs)
writer.add(input)
writer.startWriting();writer.startSession(atSourceTime:.zero)
for i in 0..<600 {
 autoreleasepool {
  while !input.isReadyForMoreMediaData {Thread.sleep(forTimeInterval:0.003)}
  let url=base.appendingPathComponent(String(format:"frames/%04d.jpg",i))
  let source=CGImageSourceCreateWithURL(url as CFURL,nil)!
  let image=CGImageSourceCreateImageAtIndex(source,0,nil)!
  var pixel:CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil,adaptor.pixelBufferPool!,&pixel)
  let p=pixel!;CVPixelBufferLockBaseAddress(p,[])
  let context=CGContext(data:CVPixelBufferGetBaseAddress(p),width:1080,height:1920,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(p),space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
  context.draw(image,in:CGRect(x:0,y:0,width:1080,height:1920))
  CVPixelBufferUnlockBaseAddress(p,[])
  if !adaptor.append(p,withPresentationTime:CMTime(value:Int64(i),timescale:60)){fatalError("Append: \(String(describing:writer.error))")}
 }
 if i%120==0 {print("Encoded \(i)/600");fflush(stdout)}
}
input.markAsFinished();writer.endSession(atSourceTime:CMTime(value:10,timescale:1))
let sem=DispatchSemaphore(value:0)
writer.finishWriting {sem.signal()};sem.wait()
if writer.status != .completed {fatalError("Writer: \(String(describing:writer.error))")}
let composition=AVMutableComposition()
let video=AVURLAsset(url:silent), audio=AVURLAsset(url:base.appendingPathComponent("quefalta-original-score.wav"))
let duration=CMTime(value:10,timescale:1)
let v=composition.addMutableTrack(withMediaType:.video,preferredTrackID:kCMPersistentTrackID_Invalid)!
try v.insertTimeRange(CMTimeRange(start:.zero,duration:duration),of:video.tracks(withMediaType:.video)[0],at:.zero)
let a=composition.addMutableTrack(withMediaType:.audio,preferredTrackID:kCMPersistentTrackID_Invalid)!
try a.insertTimeRange(CMTimeRange(start:.zero,duration:duration),of:audio.tracks(withMediaType:.audio)[0],at:.zero)
let export=AVAssetExportSession(asset:composition,presetName:AVAssetExportPresetHighestQuality)!
export.outputURL=output;export.outputFileType = .mp4;export.shouldOptimizeForNetworkUse=true
export.timeRange=CMTimeRange(start:.zero,duration:duration)
let done=DispatchSemaphore(value:0)
export.exportAsynchronously{done.signal()};done.wait()
if export.status != .completed {fatalError("Export: \(String(describing:export.error))")}
let finished=AVURLAsset(url:output)
let vt=finished.tracks(withMediaType:.video)[0]
let at=finished.tracks(withMediaType:.audio)[0]
let info:[String:Any] = ["duration":CMTimeGetSeconds(finished.duration),"width":vt.naturalSize.width,"height":vt.naturalSize.height,"fps":vt.nominalFrameRate,"videoDataRate":vt.estimatedDataRate,"audioDataRate":at.estimatedDataRate,"audioTracks":finished.tracks(withMediaType:.audio).count,"frames":600]
let report=try JSONSerialization.data(withJSONObject:info,options:.prettyPrinted)
try report.write(to:base.appendingPathComponent("video-report.json"))
print(String(data:report,encoding:.utf8)!)
