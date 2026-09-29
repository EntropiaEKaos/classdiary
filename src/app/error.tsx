"use client";
export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  return <main className="auth-page"><section className="auth-card"><span className="badge">ClassDiary</span><h1>Algo não saiu como esperado</h1><p className="muted">O erro foi registrado pela aplicação. Tente novamente; se persistir, informe o código abaixo ao administrador.</p>{error.digest?<code>{error.digest}</code>:null}<button className="btn btn-primary" onClick={reset}>Tentar novamente</button></section></main>;
}
