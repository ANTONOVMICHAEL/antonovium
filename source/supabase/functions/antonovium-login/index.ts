import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const ORIGIN='https://antonovmichael.github.io',URL='https://antonovmichael.github.io/antonovium/';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type,apikey,x-client-info,authorization','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST'||req.headers.get('Origin')!==ORIGIN)return Response.json({error:'Запрос не разрешен'},{status:403,headers});
 try{
  const raw=await req.text();if(raw.length>1000)throw Error();const email=String(JSON.parse(raw).email??'').trim().toLowerCase();
  const {data:allowed,error}=await admin.rpc('av_login_lease',{p_email:email});
  if(error||!allowed)return Response.json({message:'Если адрес разрешен для этой библиотеки, письмо для входа будет отправлено. Повторная отправка возможна через минуту.'},{headers});
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:URL}});
  if(result.error)return Response.json({error:'Почтовый сервис не отправил письмо. Возможно, достигнут лимит отправки или нужна настройка SMTP.'},{status:503,headers});
  return Response.json({message:'Письмо для входа отправлено. Открой ссылку в нем на нужном устройстве.'},{headers});
 }catch{return Response.json({error:'Не удалось обработать запрос'},{status:400,headers});}
});
