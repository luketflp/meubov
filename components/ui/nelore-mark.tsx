interface NeloreMarkProps extends React.SVGProps<SVGSVGElement> {
  /**
   * Unique per simultaneously-mounted instance: SVG url(#id) resolution is
   * document-wide, so two instances sharing an id would both use the first
   * instance's mask (and its SMIL clock).
   */
  maskId?: string;
  /** Full choreography cycle. Loading contexts want ~3500; the hero runs 9000. */
  durationMs?: number;
}

/**
 * Animated MeuBov brand mark: the Nelore line-art illustration (vector-traced
 * from the brand drawing) that draws itself in on every loop. The artwork is a
 * single filled path revealed by an SVG mask whose "pen stroke" corridors are
 * animated in natural drawing order: muzzle -> head -> ear -> face details ->
 * dewlap -> cupim -> hindquarters; a full-canvas fade inside the mask
 * guarantees complete coverage before the brand-green ear tag clips on and
 * swings to rest; then the sketch fades and redraws.
 *
 * ALL motion is SMIL on one clock (Chrome neither runs CSS animations on mask
 * content nor keeps SMIL and CSS timelines in sync across hidden-tab
 * throttling, so mixing the two desyncs the choreography). The ink is
 * `currentColor` with a single default color declaration below; reduced motion
 * swaps the animated layer for a static duplicate via CSS `display`.
 */
export function NeloreMark({
  maskId = "nelore-reveal",
  durationMs = 9000,
  ...props
}: NeloreMarkProps) {
  const dur = `${durationMs / 1000}s`;
  const artId = `${maskId}-artwork`;
  const tagId = `${maskId}-tag`;
  return (
    <svg
      viewBox="0 0 1348 1084"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
      {...props}
    >
      <style>{`
        .meubov-nelore { color: var(--color-sidebar); }
        .meubov-nelore .static-fallback { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .meubov-nelore .animated { display: none; }
          .meubov-nelore .static-fallback { display: inline; }
        }
      `}</style>
      <defs>
        <g id={artId} fill="currentColor" stroke="none">
          <g transform="translate(0.000000,1084.000000) scale(0.100000,-0.100000)">
            <path d="M4645 10235 c-165 -26 -384 -87 -670 -188 -38 -13 -97 -27 -130 -31 -609 -70 -1251 -504 -1586 -1071 -113 -191 -188 -398 -279 -768 -91 -371 -128 -451 -438 -947 -240 -383 -273 -424 -562 -710 -224 -221 -284 -301 -332 -439 -64 -185 -3 -435 166 -681 107 -157 210 -233 352 -262 63 -13 76 -20 105 -54 161 -186 353 -273 604 -273 180 0 296 36 420 131 96 72 83 69 265 62 189 -7 247 -20 342 -75 88 -52 130 -102 193 -236 93 -196 152 -270 351 -439 242 -206 282 -282 325 -619 46 -365 112 -562 248 -742 162 -216 349 -333 616 -388 257 -53 365 -150 438 -395 27 -90 57 -268 57 -341 0 -97 49 -285 97 -369 105 -185 221 -290 451 -410 168 -87 192 -118 278 -350 113 -307 427 -500 810 -500 117 0 304 18 304 29 0 4 -57 15 -127 25 -493 68 -752 230 -862 534 -71 195 -153 293 -321 381 -297 156 -424 325 -466 624 -16 115 -8 216 31 387 120 525 100 839 -96 1521 -19 68 -24 90 -53 234 -22 116 -46 322 -46 404 0 39 -4 71 -9 71 -18 0 -24 -111 -18 -324 6 -216 15 -294 66 -553 70 -354 84 -481 85 -743 0 -143 -4 -251 -12 -295 -23 -125 -45 -215 -52 -215 -4 0 -20 30 -35 68 -90 214 -223 312 -493 366 -189 38 -284 84 -410 201 -203 188 -301 418 -347 817 -38 329 -133 506 -360 670 -161 118 -238 211 -331 404 -135 278 -337 393 -696 394 -63 0 -102 17 -67 29 36 12 127 115 166 188 50 94 165 381 161 400 -3 16 -74 -81 -205 -282 -194 -298 -299 -338 -705 -266 -147 26 -204 31 -329 31 -167 0 -195 7 -251 64 -40 40 -80 127 -86 188 l-5 48 -49 0 c-84 0 -184 67 -231 155 -18 33 -22 57 -22 132 l0 92 39 40 c48 49 100 68 219 80 65 6 97 15 118 30 34 25 39 26 39 5 0 -60 -97 -134 -188 -144 -80 -8 -116 -41 -127 -115 -32 -209 263 -283 408 -102 90 112 99 284 21 377 -65 76 -205 106 -374 81 -153 -24 -189 -25 -196 -8 -14 38 93 163 279 324 121 106 258 269 383 458 51 79 94 146 94 151 0 4 6 15 14 23 27 30 279 455 327 552 27 54 63 140 79 191 28 85 42 140 86 328 74 317 173 562 309 765 183 274 401 475 719 664 220 131 425 204 711 255 85 16 196 46 323 89 319 109 429 131 657 131 156 1 202 -2 260 -18 324 -88 510 -265 641 -610 58 -152 100 -211 237 -338 155 -143 285 -274 356 -359 198 -235 185 -223 376 -346 424 -274 926 -527 1268 -640 169 -55 269 -143 356 -311 228 -445 240 -1108 35 -1942 -14 -58 -29 -121 -33 -140 -5 -19 -23 -89 -41 -155 -17 -66 -45 -172 -61 -235 -16 -63 -50 -190 -75 -283 -43 -159 -53 -220 -26 -163 22 47 30 69 82 216 29 80 62 174 75 210 98 273 208 670 245 885 5 28 15 88 24 135 67 388 68 860 2 1126 -42 170 -79 271 -139 384 -38 72 -118 190 -129 190 -4 0 -8 7 -8 15 0 11 12 15 46 15 196 0 398 110 666 364 373 353 528 472 800 611 717 368 1573 344 2133 -60 416 -299 601 -755 494 -1220 -51 -222 -42 -200 -78 -197 -133 13 -497 -70 -736 -168 -122 -50 -362 -180 -333 -180 4 0 87 27 186 60 317 106 510 144 732 145 218 0 218 0 283 -93 153 -218 438 -383 845 -488 176 -45 162 -49 162 46 0 79 0 80 -27 85 -425 91 -779 287 -876 486 -39 79 -42 114 -19 195 183 622 -130 1276 -763 1597 -685 347 -1522 281 -2264 -178 -191 -118 -281 -194 -618 -517 -244 -234 -388 -316 -604 -343 -246 -31 -802 201 -1469 612 -215 132 -236 149 -367 301 -133 155 -261 285 -407 416 -125 113 -158 158 -194 268 -94 286 -197 438 -393 583 -221 163 -526 229 -834 180z m-2880 -5116 c279 -35 405 -48 438 -49 20 0 37 -4 37 -10 0 -24 -121 -83 -226 -110 -97 -25 -175 -25 -288 0 -130 29 -316 127 -316 167 0 22 179 23 355 2z M3620 9275 c-414 -103 -694 -386 -858 -865 -78 -227 -79 -283 -2 -95 180 439 492 770 879 930 50 21 88 42 85 46 -3 5 -6 9 -7 8 -1 0 -45 -11 -97 -24z M5617 8973 c-9 -328 -66 -473 -261 -663 -115 -112 -146 -167 -154 -269 -10 -139 67 -275 209 -372 98 -67 93 -51 86 -239 -3 -91 -12 -203 -18 -250 -7 -49 -12 -201 -13 -355 0 -261 1 -273 26 -366 62 -228 202 -404 435 -547 69 -43 114 -68 276 -156 94 -51 249 -181 385 -324 165 -174 218 -209 297 -198 91 14 146 98 167 254 21 164 -2 306 -105 637 -76 243 -99 343 -152 659 -102 603 -175 854 -352 1211 -35 72 -77 150 -92 175 -15 25 -45 74 -66 110 -62 103 -129 194 -133 182 -2 -7 5 -27 16 -44 239 -398 387 -870 502 -1605 44 -280 86 -479 131 -610 93 -274 133 -478 127 -644 -8 -240 -61 -256 -238 -72 -179 185 -253 249 -405 350 -56 37 -93 58 -250 143 -153 83 -296 220 -357 341 -97 195 -116 374 -87 824 12 182 23 332 25 334 29 34 190 -274 275 -524 86 -250 157 -355 384 -564 146 -135 313 -301 357 -356 40 -51 122 -168 137 -197 8 -16 16 -26 18 -24 6 6 -86 176 -135 250 -71 107 -130 177 -295 350 -240 251 -284 321 -377 596 -23 69 -53 149 -66 178 -13 29 -24 55 -24 58 0 3 -19 43 -41 87 -86 171 -193 295 -364 425 -227 172 -221 376 15 512 86 50 185 140 219 200 25 46 24 49 -10 19 -32 -29 -126 -89 -138 -89 -5 0 6 30 25 68 88 173 104 367 52 622 -20 97 -25 76 -31 -117z M3542 8451 c-78 -27 -160 -88 -211 -158 -52 -70 -59 -84 -130 -235 -27 -59 -69 -133 -93 -165 -131 -172 -151 -227 -46 -127 122 116 207 144 338 113 25 -6 86 -11 135 -11 136 -1 218 41 295 151 59 83 84 96 159 76 118 -30 136 -19 36 24 -49 21 -115 50 -147 64 -227 104 -374 97 -521 -25 -27 -22 -51 -38 -54 -35 -11 12 60 118 105 158 145 129 285 131 542 6 63 -31 116 -54 118 -52 2 1 -15 20 -38 41 -175 162 -347 224 -488 175z m102 -267 c20 -8 21 -48 2 -64 -20 -16 -56 -9 -70 13 -18 29 31 65 68 51z m142 -142 c-11 -32 -91 -100 -132 -111 -54 -15 -127 -14 -230 5 -49 8 -106 13 -126 10 -24 -4 -38 -2 -38 5 0 16 101 116 106 104 15 -37 49 -78 76 -95 79 -48 247 -12 300 63 34 50 56 59 44 19z M4916 8288 c-71 -293 -80 -353 -78 -520 1 -135 12 -239 42 -384 34 -160 38 -151 33 66 -4 166 -1 247 17 425 38 380 48 565 31 565 -5 0 -25 -69 -45 -152z M7866 7590 c3 -47 9 -121 15 -165 17 -146 27 -572 17 -785 -23 -509 -78 -872 -217 -1445 -66 -273 -121 -451 -394 -1295 -238 -734 -285 -945 -307 -1378 -16 -301 5 -470 25 -202 29 395 121 776 368 1520 486 1462 599 1993 601 2815 1 367 -12 526 -65 799 -42 217 -49 238 -43 136z M11722 6640 c-250 -64 -426 -159 -657 -353 -304 -255 -461 -491 -871 -1307 -362 -722 -461 -888 -927 -1550 -228 -324 -381 -614 -466 -883 -48 -150 -49 -189 -3 -82 149 341 274 546 580 955 410 545 550 773 874 1425 440 885 536 1043 793 1301 209 210 509 407 730 478 150 49 115 59 -53 16z M4523 5978 c-329 -415 -661 -587 -1197 -624 -141 -10 -82 -28 105 -32 300 -7 494 38 694 162 136 85 318 296 430 499 47 86 40 85 -32 -5z M6042 5627 c-22 -81 -86 -491 -121 -782 -119 -990 -56 -2009 194 -3115 152 -671 315 -1061 540 -1297 82 -86 92 -76 22 24 -208 298 -385 814 -522 1528 -36 188 -66 356 -75 415 -5 36 -17 110 -25 165 -119 768 -132 1498 -45 2490 6 66 15 176 20 245 5 69 14 179 20 244 11 131 10 146 -8 83z M12290 3693 c0 -5 7 -27 15 -50 107 -309 175 -836 160 -1258 -13 -401 -51 -609 -225 -1240 -4 -16 -20 -73 -34 -125 -14 -52 -46 -183 -71 -290 -24 -107 -49 -214 -55 -238 -26 -109 -5 -88 40 41 16 45 47 134 70 197 23 63 64 176 90 250 26 74 55 153 63 175 63 166 159 502 191 665 45 236 51 310 50 620 -1 377 -21 525 -112 820 -66 215 -183 494 -182 433z M7574 3397 c-60 -93 -185 -434 -243 -663 -69 -274 -95 -472 -94 -719 0 -320 37 -514 160 -845 64 -173 79 -181 39 -22 -175 691 -133 1386 133 2187 34 101 34 106 5 62z M8665 2153 c-17 -268 10 -396 145 -678 104 -216 121 -256 161 -370 42 -123 128 -427 154 -550 38 -177 44 -129 15 131 -41 377 -89 535 -243 801 -135 235 -184 391 -197 628 -9 171 -7 155 -19 155 -5 0 -12 -53 -16 -117z M6677 1931 c-9 -34 10 -316 28 -426 40 -239 115 -468 226 -685 69 -137 183 -325 215 -357 20 -20 21 -24 -33 89 -195 400 -362 929 -403 1273 -14 109 -23 141 -33 106z" />
          </g>
        </g>
        {/* ear tag centered on its pivot so SMIL scale/rotate act around it */}
        <g id={tagId}>
          <rect x="-45" y="-5" width="95" height="80" rx="22" fill="var(--color-brand)" />
        </g>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1348" height="1084">
          <rect width="1348" height="1084" fill="#000" />
          {/* failsafe: completes the reveal even where corridors leave slivers */}
          <rect width="1348" height="1084" fill="#fff" opacity="0">
            <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.6;0.68;1" dur={dur} repeatCount="indefinite" />
          </rect>
          {/* pen-stroke corridors in drawing order */}
          <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 120 500 C 150 380, 300 180, 560 120" pathLength={1} strokeWidth={150} strokeDasharray="1 1" strokeDashoffset={1}>
            <animate
              attributeName="stroke-dashoffset"
              values="1;1;0;0"
              keyTimes="0;0.03;0.14;1"
              calcMode="spline"
              keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1"
              dur={dur}
              repeatCount="indefinite"
            />
          </path>
          <path d="M 100 520 C 150 620, 300 640, 420 700 C 500 760, 480 900, 560 1000" pathLength={1} strokeWidth={170} strokeDasharray="1 1" strokeDashoffset={1}>
            <animate
              attributeName="stroke-dashoffset"
              values="1;1;0;0"
              keyTimes="0;0.10;0.26;1"
              calcMode="spline"
              keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1"
              dur={dur}
              repeatCount="indefinite"
            />
          </path>
          <path d="M 560 120 C 640 180, 660 320, 640 440 C 630 500, 660 540, 700 545" pathLength={1} strokeWidth={160} strokeDasharray="1 1" strokeDashoffset={1}>
            <animate
              attributeName="stroke-dashoffset"
              values="1;1;0;0"
              keyTimes="0;0.20;0.30;1"
              calcMode="spline"
              keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1"
              dur={dur}
              repeatCount="indefinite"
            />
          </path>
          <path d="M 330 280 C 400 300, 430 420, 420 520" pathLength={1} strokeWidth={140} strokeDasharray="1 1" strokeDashoffset={1}>
            <animate
              attributeName="stroke-dashoffset"
              values="1;1;0;0"
              keyTimes="0;0.27;0.36;1"
              calcMode="spline"
              keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1"
              dur={dur}
              repeatCount="indefinite"
            />
          </path>
          <path d="M 620 560 C 680 700, 700 900, 660 1060" pathLength={1} strokeWidth={170} strokeDasharray="1 1" strokeDashoffset={1}>
            <animate
              attributeName="stroke-dashoffset"
              values="1;1;0;0"
              keyTimes="0;0.34;0.48;1"
              calcMode="spline"
              keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1"
              dur={dur}
              repeatCount="indefinite"
            />
          </path>
          <path d="M 700 400 C 820 300, 950 200, 1100 210 C 1250 230, 1300 350, 1340 420" pathLength={1} strokeWidth={180} strokeDasharray="1 1" strokeDashoffset={1}>
            <animate
              attributeName="stroke-dashoffset"
              values="1;1;0;0"
              keyTimes="0;0.42;0.58;1"
              calcMode="spline"
              keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1"
              dur={dur}
              repeatCount="indefinite"
            />
          </path>
          <path d="M 860 500 C 950 650, 1000 850, 980 1080 C 1150 900, 1250 700, 1348 560" pathLength={1} strokeWidth={260} strokeDasharray="1 1" strokeDashoffset={1}>
            <animate
              attributeName="stroke-dashoffset"
              values="1;1;0;0"
              keyTimes="0;0.52;0.66;1"
              calcMode="spline"
              keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1"
              dur={dur}
              repeatCount="indefinite"
            />
          </path>
          </g>
        </mask>
      </defs>
      <g className="meubov-nelore">
        <g className="animated">
          <g opacity="1">
            <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.94;0.99;1" dur={dur} repeatCount="indefinite" />
            <g mask={`url(#${maskId})`}>
              <use href={`#${artId}`} />
            </g>
            <g transform="translate(655 540)">
              <g>
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values="0.6;0.6;1.1;1;1"
                  keyTimes="0;0.66;0.69;0.71;1"
                  calcMode="spline"
                  keySplines="0 0 1 1;0.42 0 0.58 1;0.42 0 0.58 1;0 0 1 1"
                  dur={dur}
                  repeatCount="indefinite"
                />
                <g opacity="0">
                  <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.66;0.69;1" dur={dur} repeatCount="indefinite" />
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    values="0;0;-10;7;-3.5;1.5;0;0"
                    keyTimes="0;0.71;0.75;0.81;0.86;0.9;0.93;1"
                    calcMode="spline"
                    keySplines="0 0 1 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0 0 1 1"
                    dur={dur}
                    repeatCount="indefinite"
                  />
                  <use href={`#${tagId}`} />
                </g>
              </g>
            </g>
          </g>
        </g>
        {/* reduced motion: finished drawing, tag in place, no animation */}
        <g className="static-fallback">
          <use href={`#${artId}`} />
          <use href={`#${tagId}`} transform="translate(655 540)" />
        </g>
      </g>
    </svg>
  );
}
