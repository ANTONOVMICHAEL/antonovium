import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand,CreateMultipartUploadCommand,UploadPartCommand,ListPartsCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand} from 'npm:@aws-sdk/client-s3@3.1152.0';
import {getSignedUrl} from 'npm:@aws-sdk/s3-request-presigner@3.1152.0';
const ORIGIN='https://antonovmichael.github.io';
const TTL=900,MiB=1048576;
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function check<T>(value:{data:T;error:unknown}):T{if(value.error)fail('Ошибка базы данных',500);return value.data;}
const text=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
type StorageCredentials={bucket:string;access_key_id:string;secret_access_key:string};
async function credentials():Promise<StorageCredentials|null>{
 const bucket=Deno.env.get('YC_BUCKET'),access_key_id=Deno.env.get('YC_ACCESS_KEY_ID'),secret_access_key=Deno.env.get('YC_SECRET_ACCESS_KEY');
 if(bucket&&access_key_id&&secret_access_key)return {bucket,access_key_id,secret_access_key};
 const {data,error}=await admin.rpc('av_storage_credentials');
 if(error)fail('Не удалось получить настройки хранилища',503);
 if(!data||typeof data.bucket!=='string'||typeof data.access_key_id!=='string'||typeof data.secret_access_key!=='string'||!data.bucket||!data.access_key_id||!data.secret_access_key)return null;
 return data as StorageCredentials;
}
async function storage(){const c=await credentials();if(!c)fail('Приватное хранилище еще не настроено. Загрузка не выполнена.',503);return {bucket:c.bucket,s3:new S3Client({endpoint:'https://storage.yandexcloud.net',region:'ru-central1',credentials:{accessKeyId:c.access_key_id,secretAccessKey:c.secret_access_key},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'})};}
function partSize(size:number){return Math.max(16*MiB,Math.ceil(size/9999/MiB)*MiB);}
async function authorized(req:Request){
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)fail('Требуется вход',401);
 const {data:{user},error}=await admin.auth.getUser(token);if(error||!user||!user.email_confirmed_at||!user.email)fail('Сессия недействительна',401);
 const {data:m,error:me}=await admin.from('av_library_members').select('email,user_id,enabled').eq('email',user!.email!.toLowerCase()).maybeSingle();
 if(me||!m?.enabled||(m.user_id&&m.user_id!==user!.id))fail('Доступ к библиотеке не разрешен',403);
 if(!m.user_id)check(await admin.from('av_library_members').update({user_id:user!.id}).eq('email',m.email).or(`user_id.is.null,user_id.eq.${user!.id}`).select('user_id').single());
 return user!;
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 try{
  if(req.method!=='POST')fail('Метод не поддерживается',405);
  const origin=req.headers.get('Origin');if(origin&&origin!==ORIGIN)fail('Недопустимый адрес приложения',403);
  const user=await authorized(req);
  if(Number(req.headers.get('Content-Length')||0)>65536)fail('Слишком большой запрос',413);
  const raw=await req.text();if(raw.length>65536)fail('Слишком большой запрос',413);
  const p=JSON.parse(raw),action=p.action;
  if(action==='hello')return Response.json({user_id:user.id,storage_ready:!!(await credentials())},{headers});
  const {s3,bucket}=await storage();
  let book:any;
  if(action==='init'){
   const format=p.format,size=Number(p.size),fingerprint=p.fingerprint;
   if(!['pdf','fb2'].includes(format)||!Number.isSafeInteger(size)||size<=0||size>5*1024**4||!(/^[a-f0-9]{64}$/.test(fingerprint)))fail('Некорректный файл');
   const existing=check(await admin.from('av_books').select('*').eq('owner_id',user.id).eq('fingerprint',fingerprint).maybeSingle());
   if(existing?.status==='ready')return Response.json({book:existing,duplicate:true},{headers});
   if(existing?.status==='deleting')fail('Удаление прежней копии еще не закончено',409);
   if(existing)book=existing;
   else{
    const title=text(p.title,500);if(!title)fail('Укажи название книги');const cover=typeof p.cover==='string'&&p.cover.length<=100000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.cover)?p.cover:null;
    const {count}=await admin.from('av_books').select('id',{count:'exact',head:true}).eq('owner_id',user.id).eq('status','uploading');
    if((count??0)>=3)fail('Заверши или отмени предыдущие загрузки',429);
    const id=crypto.randomUUID();book=check(await admin.from('av_books').insert({id,owner_id:user.id,title,cover,author:text(p.author,500),edition:text(p.edition,1000),format,original_name:text(p.name,1000),object_key:`${user.id}/${id}/original.${format}`,size_bytes:size,fingerprint,status:'uploading'}).select().single());
   }
   if(size>64*MiB&&!book.upload_id){const m=await s3.send(new CreateMultipartUploadCommand({Bucket:bucket,Key:book.object_key,ContentType:format==='pdf'?'application/pdf':'application/xml'}));book=check(await admin.from('av_books').update({upload_id:m.UploadId,status:'uploading'}).eq('id',book.id).eq('owner_id',user.id).select().single());}
   let needs_completion=false;if(existing){try{const h=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:book.object_key}));needs_completion=h.ContentLength===book.size_bytes}catch{}}
   const url=book.upload_id?undefined:await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:book.object_key,ContentLength:size,ContentType:format==='pdf'?'application/pdf':'application/xml'}),{expiresIn:300});
   return Response.json({book,url,needs_completion,multipart:!!book.upload_id,part_size:partSize(size)},{headers});
  }
  if(typeof p.id!=='string'||!/^[a-f0-9-]{36}$/i.test(p.id))fail('Некорректный идентификатор');
  book=check(await admin.from('av_books').select('*').eq('id',p.id).eq('owner_id',user.id).maybeSingle());if(!book)fail('Книга не найдена',404);
  const args={Bucket:bucket,Key:book.object_key};
  if(action==='parts'){
   if(book.status!=='uploading'||!book.upload_id)fail('Загрузка не активна',409);
   const n=Math.ceil(book.size_bytes/partSize(book.size_bytes));
   if(!Array.isArray(p.parts)||p.parts.length<1||p.parts.length>8||p.parts.some((i:number)=>!Number.isInteger(i)||i<1||i>n))fail('Некорректные части');
   const urls=await Promise.all(p.parts.map(async(i:number)=>({number:i,url:await getSignedUrl(s3,new UploadPartCommand({...args,UploadId:book.upload_id,PartNumber:i,ContentLength:Math.min(partSize(book.size_bytes),book.size_bytes-(i-1)*partSize(book.size_bytes))}),{expiresIn:300})})));
   return Response.json({parts:urls},{headers});
  }
  if(action==='complete'){
   if(book.status==='ready')return Response.json({book},{headers});
   if(book.status!=='uploading')fail('Книга не загружается',409);
   let alreadyStored=false;try{const head=await s3.send(new HeadObjectCommand(args));alreadyStored=head.ContentLength===book.size_bytes}catch{}
   if(book.upload_id&&!alreadyStored){
    const parts:any[]=[];let marker:string|undefined;
    do{const list=await s3.send(new ListPartsCommand({...args,UploadId:book.upload_id,PartNumberMarker:marker}));parts.push(...list.Parts??[]);marker=list.IsTruncated?list.NextPartNumberMarker:undefined;}while(marker!==undefined);
    const step=partSize(book.size_bytes),count=Math.ceil(book.size_bytes/step);
    if(parts.length!==count||parts.some((v,i)=>v.PartNumber!==i+1||v.Size!==Math.min(step,book.size_bytes-i*step)))fail('Не все части файла получены',409);
    await s3.send(new CompleteMultipartUploadCommand({...args,UploadId:book.upload_id,MultipartUpload:{Parts:parts.map(v=>({PartNumber:v.PartNumber,ETag:v.ETag}))}}));
   }
   const head=await s3.send(new HeadObjectCommand(args));if(head.ContentLength!==book.size_bytes)fail('Размер загруженного файла не совпадает',409);
   const sample=await s3.send(new GetObjectCommand({...args,Range:'bytes=0-4095'}));const bytes=await sample.Body!.transformToByteArray();
   const preview=new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8').decode(bytes);
   if(book.format==='pdf'?!preview.slice(0,1024).includes('%PDF-'):!/<(?:\w+:)?FictionBook\b/i.test(preview))fail('Содержимое не соответствует формату книги');
   book=check(await admin.from('av_books').update({status:'ready',upload_id:null,updated_at:new Date().toISOString()}).eq('id',book.id).eq('owner_id',user.id).select().single());return Response.json({book},{headers});
  }
  if(action==='read'){
   if(book.status!=='ready')fail('Загрузка книги еще не завершена',409);
   const url=await getSignedUrl(s3,new GetObjectCommand({...args,ResponseCacheControl:'private, no-store',ResponseContentDisposition:`attachment; filename="book.${book.format}"`,ResponseContentType:book.format==='pdf'?'application/pdf':'application/octet-stream'}),{expiresIn:TTL});
   return Response.json({url,expires_in:TTL},{headers});
  }
  if(action==='metadata'){
   const title=text(p.title,500);if(!title)fail('Укажи название');
   book=check(await admin.from('av_books').update({title,author:text(p.author,500),edition:text(p.edition,1000),updated_at:new Date().toISOString()}).eq('id',book.id).eq('owner_id',user.id).select().single());return Response.json({book},{headers});
  }
  if(action==='delete'||action==='abort'){
   check(await admin.from('av_books').update({status:'deleting'}).eq('id',book.id).eq('owner_id',user.id));
   if(book.upload_id){try{await s3.send(new AbortMultipartUploadCommand({...args,UploadId:book.upload_id}))}catch(e){if((e as any)?.name!=='NoSuchUpload'&&(e as any)?.$metadata?.httpStatusCode!==404)throw e;}}
   await s3.send(new DeleteObjectCommand(args));check(await admin.from('av_books').delete().eq('id',book.id).eq('owner_id',user.id));return Response.json({deleted:true},{headers});
  }
  fail('Неизвестная операция');
 }catch(e){const status=Number((e as any)?.status)||500;return Response.json({error:status===500?'Не удалось выполнить операцию. Данные сохранены; попробуй еще раз.':(e as Error).message},{status,headers});}
});
