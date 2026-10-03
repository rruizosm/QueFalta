import Foundation
import AVFoundation
import AppKit
let base=URL(fileURLWithPath:CommandLine.arguments[1],isDirectory:true)
let asset=AVURLAsset(url:base.appendingPathComponent("bm-quefalta-10s.mp4"))
let v=asset.tracks(withMediaType:.video).first!
let a=asset.tracks(withMediaType:.audio).first!
let reader=try AVAssetReader(asset:asset)
let output=AVAssetReaderTrackOutput(track:v,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
reader.add(output);reader.startReading()
var ptsValues:[Double]=[];var frames=0;var last=0.0;var previous = -1.0;var monotonic=true
while let sample=output.copyNextSampleBuffer(){frames+=CMSampleBufferGetNumSamples(sample);let pts=CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample));ptsValues.append(pts);if pts<previous {monotonic=false};previous=pts;last=max(last,pts)}
let audioReader=try AVAssetReader(asset:asset)
let audioOut=AVAssetReaderTrackOutput(track:a,outputSettings:[AVFormatIDKey:kAudioFormatLinearPCM,AVLinearPCMIsFloatKey:true,AVLinearPCMBitDepthKey:32,AVLinearPCMIsNonInterleaved:false])
audioReader.add(audioOut);audioReader.startReading()
var audioSamples=0;var peak:Float=0;var squares:Double=0
while let sample=audioOut.copyNextSampleBuffer(){guard let block=CMSampleBufferGetDataBuffer(sample) else{continue};let length=CMBlockBufferGetDataLength(block);var bytes=[UInt8](repeating:0,count:length);CMBlockBufferCopyDataBytes(block,atOffset:0,dataLength:length,destination:&bytes);bytes.withUnsafeBytes { raw in for f in raw.bindMemory(to:Float.self){peak=max(peak,abs(f));squares+=Double(f*f);audioSamples+=1}}}
let gen=AVAssetImageGenerator(asset:asset);gen.appliesPreferredTrackTransform=true;gen.requestedTimeToleranceBefore = .zero;gen.requestedTimeToleranceAfter = .zero
for s in [0.4,1.2,2.5,4.8,6.7,8.8,9.983333] {let cg=try gen.copyCGImage(at:CMTime(seconds:s,preferredTimescale:600),actualTime:nil);let rep=NSBitmapImageRep(cgImage:cg);let data=rep.representation(using:.jpeg,properties:[.compressionFactor:0.93])!;try data.write(to:base.appendingPathComponent(String(format:"review/final-%.2f.jpg",s)))}
let codecs=v.formatDescriptions.map{CMFormatDescriptionGetMediaSubType($0 as! CMFormatDescription)}
func fourCC(_ code: FourCharCode) -> String { String(bytes: [UInt8((code >> 24)&255),UInt8((code >> 16)&255),UInt8((code >> 8)&255),UInt8(code&255)], encoding:.ascii) ?? "unknown" }
let afd=a.formatDescriptions.first as! CMAudioFormatDescription
let audioDescription=CMAudioFormatDescriptionGetStreamBasicDescription(afd)!.pointee
let times=ptsValues.sorted()
let cfr=zip(times.dropFirst(),times).allSatisfy {abs(($0-$1)-1.0/30)<0.00001}
let info:[String:Any]=["audioCodec":fourCC(CMFormatDescriptionGetMediaSubType(afd)),"audioChannels":audioDescription.mChannelsPerFrame,"audioSampleRate":audioDescription.mSampleRate,"constantFrameRate":cfr,"fps":v.nominalFrameRate,"width":v.naturalSize.width,"height":v.naturalSize.height,"videoCodec":fourCC(codecs[0]),"decodedVideoSamples":frames,"lastPresentationTime":last,"audioDecodedFloatSamples":audioSamples,"audioPeakDbFS":20*log10(peak),"audioRmsDbFS":20*log10(sqrt(squares/Double(audioSamples))),"videoReaderCompleted":reader.status == .completed,"audioReaderCompleted":audioReader.status == .completed,"duration":CMTimeGetSeconds(asset.duration),"videoCodecs":codecs]
let data=try JSONSerialization.data(withJSONObject:info,options:.prettyPrinted);try data.write(to:base.appendingPathComponent("verification.json"));print(String(data:data,encoding:.utf8)!)
if !cfr || audioDescription.mChannelsPerFrame != 2 || frames != 300 || abs(CMTimeGetSeconds(asset.duration)-10)>0.000001 || audioSamples<900000 {exit(1)}
