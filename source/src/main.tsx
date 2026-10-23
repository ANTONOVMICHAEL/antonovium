import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {CloudProvider,useCloud} from './cloud';
import './styles.css';
import './cloud.css';
import './app-v2.css';
import './cabinet-library-v2.css';
import './reader-v2.css';
import './desk-v2.css';
import './workspaces-v2.css';
class Boundary extends React.Component<{children:React.ReactNode},{error:boolean}>{
  state={error:false};static getDerivedStateFromError(){return {error:true}}
  render(){return this.state.error?<main className="fatal"><h1>Не удалось открыть рабочее пространство</h1><p>Сохраненные данные остались в браузере. Обнови страницу. Если ошибка повторяется, открой резервную копию в другом браузере.</p><button onClick={()=>location.reload()}>Обновить страницу</button></main>:this.props.children;}
}
function WorkspaceRoot(){const cloud=useCloud();return <App key={cloud.authorized?cloud.session!.user.id:'guest'}/>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><CloudProvider><WorkspaceRoot/></CloudProvider></Boundary></React.StrictMode>);
