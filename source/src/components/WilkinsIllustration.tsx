import type { WilkinsPose } from '../wilkinsCompanion';
/** Lightweight animated illustration when a browser cannot create a WebGL2 context. */
export default function WilkinsIllustration({ motion, reaction, pose='idle', facing=0 }: { motion: boolean; reaction: number; pose?:WilkinsPose; facing?:number }) {
  return <svg className={`wilkins-illustration ${motion ? 'is-moving' : ''}`} viewBox="0 0 320 360" fill="none" aria-hidden="true" data-reaction={reaction} data-pose={pose} data-facing={facing}>
    <defs>
      <linearGradient id="fork-plastic" x1="108" y1="85" x2="219" y2="202" gradientUnits="userSpaceOnUse"><stop stopColor="#fffdf6"/><stop offset=".52" stopColor="#efe9d9"/><stop offset="1" stopColor="#c9bfae"/></linearGradient>
      <linearGradient id="fork-edge" x1="144" y1="150" x2="179" y2="158" gradientUnits="userSpaceOnUse"><stop stopColor="#fffdf6"/><stop offset=".55" stopColor="#ede6d6"/><stop offset="1" stopColor="#b2a994"/></linearGradient>
      <radialGradient id="clay" cx="0" cy="0" r="1" gradientTransform="translate(143 313) rotate(32) scale(70 42)" gradientUnits="userSpaceOnUse"><stop stopColor="#fffbec"/><stop offset=".65" stopColor="#e5d9c4"/><stop offset="1" stopColor="#c4ae91"/></radialGradient>
      <linearGradient id="wood" x1="71" y1="321" x2="244" y2="341" gradientUnits="userSpaceOnUse"><stop stopColor="#d2a363"/><stop offset=".55" stopColor="#f2ca83"/><stop offset="1" stopColor="#ae7739"/></linearGradient>
      <radialGradient id="eye" cx="0" cy="0" r="1" gradientTransform="translate(125 99) rotate(55) scale(41 35)" gradientUnits="userSpaceOnUse"><stop stopColor="#fff"/><stop offset=".76" stopColor="#fffaf0"/><stop offset="1" stopColor="#c9bcae"/></radialGradient>
      <filter id="fork-shadow" x="-25%" y="-25%" width="150%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <ellipse cx="159" cy="341" rx="98" ry="12" fill="#203e4d" opacity=".14" filter="url(#fork-shadow)"/>
    <g className="wilkins-illustration-feet">
      <path d="M156 313C130 317 91 317 61 325C51 328 54 338 67 339C101 343 136 329 158 327Z" fill="url(#wood)" stroke="#b08149" strokeWidth="2"/>
      <path d="M159 313C177 313 215 318 249 327C260 330 256 339 245 339C211 341 177 330 155 327Z" fill="url(#wood)" stroke="#ad7e46" strokeWidth="2"/>
    </g>
    <g className="wilkins-illustration-body">
      <path d="M149 314C147 272 148 226 148 192C148 176 139 170 125 156C100 135 101 110 104 83C105 67 108 46 112 31C113 25 119 25 121 31L133 73L135 27C136 19 143 17 146 27L157 74L164 26C165 17 171 17 175 27L184 75L201 33C204 25 210 26 213 34C219 52 224 79 220 104C218 129 209 145 195 159C179 174 172 179 171 193C170 224 172 275 171 314Z" fill="url(#fork-plastic)" stroke="#b8ad9b" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M156 179C159 212 156 275 158 309" stroke="#fffdf5" strokeWidth="5" opacity=".72" strokeLinecap="round"/>
      <path d="M167 175C168 212 168 272 167 311" stroke="#b4aa98" strokeWidth="2" opacity=".4" strokeLinecap="round"/>
      <path d="M109 94C105 123 118 150 139 161" stroke="#fffef8" strokeWidth="5" opacity=".55" strokeLinecap="round"/>
      <path d="M116 82C142 58 183 64 207 86" stroke="#c84539" strokeWidth="12" strokeLinecap="round"/>
      <path d="M118 79C143 61 182 66 202 83" stroke="#e9604d" strokeWidth="3" opacity=".7" strokeLinecap="round"/>
      <ellipse className="wilkins-illustration-eye" cx="133" cy="117" rx="28" ry="35" fill="url(#eye)" stroke="#b5a99d" strokeWidth="1.5"/>
      <ellipse className="wilkins-illustration-eye" cx="186" cy="118" rx="23" ry="28" fill="url(#eye)" stroke="#b5a99d" strokeWidth="1.5"/>
      <ellipse className="wilkins-illustration-eye" cx="130" cy="120" rx="15" ry="20" fill="#20212b"/>
      <ellipse className="wilkins-illustration-eye" cx="190" cy="120" rx="10" ry="13" fill="#24242b"/>
      <ellipse cx="123" cy="110" rx="4" ry="5" fill="white" opacity=".75"/>
      <ellipse cx="187" cy="114" rx="2.5" ry="3" fill="white" opacity=".7"/>
      <path d="M128 164C136 178 150 176 162 172C177 169 189 164 200 162C205 170 202 180 193 184C175 195 143 194 127 181C119 175 119 167 128 164Z" fill="#916f67" opacity=".42"/>
      <path d="M123 164C124 176 139 181 154 177C169 172 180 168 192 163C201 158 207 165 202 176C197 190 172 191 155 188C138 188 116 183 115 172C113 163 119 158 123 164Z" stroke="#178fb0" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M120 164C125 169 136 174 152 171" stroke="#5ac0d2" strokeWidth="2.5" opacity=".72" strokeLinecap="round"/>
    </g>
    <g className="wilkins-illustration-arms" stroke="#bd4938" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
      <g className="wilkins-left-arm"><path d="M151 220C130 218 102 215 83 221C68 225 63 239 68 250C72 262 83 267 94 273"/><path d="M94 273C82 269 76 275 80 286M94 273C96 263 99 257 105 257M94 273C102 276 107 285 108 290"/></g>
      <g className="wilkins-right-arm"><path d="M168 219C192 222 210 216 227 211C246 204 254 213 251 228"/><path d="M251 228C264 213 271 214 277 219M251 228C266 226 273 233 277 241M251 228C260 237 263 247 261 254M251 228C241 218 238 211 240 203"/></g>
    </g>
    {pose==='read'&&<g className="wilkins-prop-book"><path d="M119 224Q141 217 159 231Q180 217 201 224L201 256Q179 251 160 264Q138 252 119 256Z" fill="#345c73" stroke="#1b384a" strokeWidth="2"/><path d="M124 220Q143 215 159 229Q179 214 196 221V250Q176 246 159 258Q141 247 124 251Z" fill="#faf3df" stroke="#d0c3a7"/><path d="M159 230V257M130 230L149 235M130 238L148 242M170 235L189 229M170 243L189 237" stroke="#b2a790" strokeWidth="2"/></g>}
    <g className="wilkins-illustration-clay"><path d="M129 320C125 314 130 303 137 302C135 293 146 289 154 295C162 283 177 288 179 298C187 295 195 303 193 313C204 313 209 320 204 328C196 335 179 332 168 330C156 335 141 334 129 328C125 326 125 323 129 320Z" fill="url(#clay)" stroke="#ccbaa1" strokeWidth="2"/><path d="M141 310C148 301 162 301 168 309" stroke="white" opacity=".65" strokeWidth="3" strokeLinecap="round"/></g>
  </svg>;
}
