import Foundation
import AVFoundation
import AppKit
import AudioToolbox

let base=URL(fileURLWithPath:CommandLine.arguments[1],isDirectory:true)
let asset=AVURLAsset(url:base.appendingPathComponent("bm-quefalta-10s.mp4"))
let v=asset.tracks(withMediaType:.video).first!,a=asset.tracks(withMediaType:.audio).first!
let reader=try AVAssetReader(asset:asset)
let output=AVAssetReaderTrackOutput(track:v,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
reader.add(output);guard reader.startReading() else {fatalError("Video reader: \(String(describing:reader.error))")}
var pts=[Double](),ends=[Double](),lastPixels=[UInt8](),maxEndCardMAE=0.0,endCardFrames=0
while let sample=output.copyNextSampleBuffer(){
 let t=CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample));pts.append(t);ends.append(t+CMTimeGetSeconds(CMSampleBufferGetDuration(sample)))
 if t>=8.5,let buffer=CMSampleBufferGetImageBuffer(sample){
  CVPixelBufferLockBaseAddress(buffer,.readOnly)
  let pointer=CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to:UInt8.self),stride=CVPixelBufferGetBytesPerRow(buffer)
  var pixels=[UInt8]();for y in Swift.stride(from:0,to:1920,by:12){for x in Swift.stride(from:0,to:1080,by:12){for ch in 0..<3{pixels.append(pointer[y*stride+x*4+ch])}}}
  if !lastPixels.isEmpty {var difference=0.0;for i in 0..<pixels.count{difference+=abs(Double(pixels[i])-Double(lastPixels[i]))};maxEndCardMAE=max(maxEndCardMAE,difference/Double(pixels.count))} else {lastPixels=pixels}
  endCardFrames+=1;CVPixelBufferUnlockBaseAddress(buffer,.readOnly)
 }
}
let audioReader=try AVAssetReader(asset:asset)
let audioOut=AVAssetReaderTrackOutput(track:a,outputSettings:[AVFormatIDKey:kAudioFormatLinearPCM,AVLinearPCMIsFloatKey:true,AVLinearPCMBitDepthKey:32,AVLinearPCMIsNonInterleaved:false])
audioReader.add(audioOut);audioReader.startReading();var audioSamples=0;var peak:Float=0;var squares=0.0
while let sample=audioOut.copyNextSampleBuffer(){guard let block=CMSampleBufferGetDataBuffer(sample) else{continue};let length=CMBlockBufferGetDataLength(block);var bytes=[UInt8](repeating:0,count:length);CMBlockBufferCopyDataBytes(block,atOffset:0,dataLength:length,destination:&bytes);bytes.withUnsafeBytes{raw in for f in raw.bindMemory(to:Float.self){peak=max(peak,abs(f));squares+=Double(f*f);audioSamples+=1}}}
func fourCC(_ value:FourCharCode)->String{String(bytes:[UInt8((value>>24)&255),UInt8((value>>16)&255),UInt8((value>>8)&255),UInt8(value&255)],encoding:.ascii) ?? "unknown"}
let vformat=v.formatDescriptions.first as! CMFormatDescription, af=a.formatDescriptions.first as! CMAudioFormatDescription
let asbd=CMAudioFormatDescriptionGetStreamBasicDescription(af)!.pointee
let deltas=zip(pts.dropFirst(),pts).map{ $0.0 - $0.1 },cfr=deltas.allSatisfy{abs($0-1.0/60.0)<0.000001}
let gen=AVAssetImageGenerator(asset:asset);gen.appliesPreferredTrackTransform=true;gen.requestedTimeToleranceBefore = .zero;gen.requestedTimeToleranceAfter = .zero
let times=(0..<100).map{Double($0)/10.0}+[599.0/60.0]
for t in times {let cg=try gen.copyCGImage(at:CMTime(seconds:t,preferredTimescale:600),actualTime:nil);let rep=NSBitmapImageRep(cgImage:cg);try rep.representation(using:.jpeg,properties:[.compressionFactor:0.95])!.write(to:base.appendingPathComponent(String(format:"review/final-%05.2f.jpg",t)))}
let checks:[String:Bool]=["600_decoded_frames":pts.count==600,"constant_60_fps":cfr,"exact_10_seconds":CMTimeGetSeconds(asset.duration)==10,"1080x1920":v.naturalSize==CGSize(width:1080,height:1920),"h264":fourCC(CMFormatDescriptionGetMediaSubType(vformat))=="avc1","aac_stereo":asbd.mFormatID==kAudioFormatMPEG4AAC && asbd.mChannelsPerFrame==2,"video_decoded":reader.status == .completed,"audio_decoded":audioReader.status == .completed,"no_audio_clipping":peak<1,"stable_cta_90_frames":endCardFrames==90 && maxEndCardMAE<1]
let info:[String:Any]=["checks":checks,"duration":CMTimeGetSeconds(asset.duration),"frames":pts.count,"firstPTS":pts.first!,"lastPTS":pts.last!,"lastFrameEnd":pts.last!+1.0/60.0,"fps":v.nominalFrameRate,"videoCodec":fourCC(CMFormatDescriptionGetMediaSubType(vformat)),"audioCodec":fourCC(asbd.mFormatID),"audioChannels":asbd.mChannelsPerFrame,"sampleRate":asbd.mSampleRate,"audioDecodedFloatSamples":audioSamples,"audioPeakDbFS":20*log10(peak),"audioRmsDbFS":20*log10(sqrt(squares/Double(audioSamples))),"endCardFrameCount":endCardFrames,"endCardMaxMeanAbsolutePixelDifference":maxEndCardMAE,"reviewFrames":times.count]
let data=try JSONSerialization.data(withJSONObject:info,options:[.prettyPrinted,.sortedKeys]);try data.write(to:base.appendingPathComponent("verification.json"));print(String(data:data,encoding:.utf8)!)
if checks.values.contains(false){exit(1)}
