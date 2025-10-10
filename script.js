// 必要な定数を challenges.js からインポート
import {
    CHALLENGES,
    TARGET_ANGLES,
    TOLERANCE,
    LANDMARKS as LANDMARK_INDICES
} from './challenges.js';

const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
const matchScoreElement = document.getElementById('match-score');
const guideMessageElement = document.getElementById('guide-message');
const timerDisplayElement = document.getElementById('timer-display');

// 🚨 修正箇所 1: 新しい要素の参照を追加
const currentChallengeNameElement = document.getElementById('current-challenge-name');
const debugStartButton = document.getElementById('debug-start-button'); // ★ デバッグボタンの参照を再追加

// 🚨 追加: ピクトグラム表示関連の定数 (以前のバージョンから継承)
// このバージョンでは使用されていませんが、将来のために残しておきます。
const poseGuideOverlay = document.getElementById('pose-guide-overlay'); 
const GUIDE_LINE_COLOR = 'rgba(255, 255, 255, 0.8)'; 
const GUIDE_DOT_COLOR = 'rgba(0, 0, 0, 0.8)'; 


canvasElement.width = 640;
canvasElement.height = 480;

// 状態管理のための変数
let currentChallengeIndex = 0;
let isPoseFixed = false;
let finalPoseLandmarks = null;
let isChallengeStarted = false;
let isInPreparationPhase = false; 

const COUNTDOWN_SECONDS = 3;
const HOLD_SECONDS = 5;
const PREP_DELAY_SECONDS = 1.5;
const TOTAL_DELAY_SECONDS = COUNTDOWN_SECONDS + HOLD_SECONDS;
let challengeTimerId = null;


// =========================================================================
// 🎯 ヘルパー関数: ポーズ検出とスコア計算
// =========================================================================

/**
 * 3つのランドマークから角度を計算
 */
function calculateAngle(A, M, B) {
    const vectorMA_x = A.x - M.x;
    const vectorMA_y = A.y - M.y;
    const vectorMB_x = B.x - M.x;
    const vectorMB_y = B.y - M.y;

    const dotProduct = (vectorMA_x * vectorMB_x) + (vectorMA_y * vectorMB_y);
    const magnitudeMA = Math.sqrt(Math.pow(vectorMA_x, 2) + Math.pow(vectorMA_y, 2));
    const magnitudeMB = Math.sqrt(Math.pow(vectorMB_x, 2) + Math.pow(vectorMB_y, 2));
    
    let angleDeg = 0;
    if (magnitudeMA !== 0 && magnitudeMB !== 0) {
        let cosTheta = dotProduct / (magnitudeMA * magnitudeMB);
        cosTheta = Math.max(-1, Math.min(1, cosTheta));
        let angleRad = Math.acos(cosTheta);
        angleDeg = angleRad * (180 / Math.PI);
    }
    return angleDeg;
}

/**
 * 起動トリガー用のポーズが取られているか判定する (両腕垂直上げ)
 */
function isStartPoseAchieved(landmarks) {
    const L = LANDMARK_INDICES;
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE.START_TOLERANCE;

    if (!landmarks) return false;

    const requiredLandmarks = [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST, L.LEFT_HIP,
                               L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST, L.RIGHT_HIP];
    for (const index of requiredLandmarks) {
        if (!landmarks[index] || landmarks[index].visibility < 0.7) {
            return false;
        }
    }

    const leftElbowAngle = calculateAngle(landmarks[L.LEFT_SHOULDER], landmarks[L.LEFT_ELBOW], landmarks[L.LEFT_WRIST]);
    const leftShoulderAngle = calculateAngle(landmarks[L.LEFT_HIP], landmarks[L.LEFT_SHOULDER], landmarks[L.LEFT_ELBOW]);
    const isLeftArmReady = (
        Math.abs(leftElbowAngle - target.ELBOW) <= tolerance &&
        Math.abs(leftShoulderAngle - target.SHOULDER) <= tolerance
    );

    const rightElbowAngle = calculateAngle(landmarks[L.RIGHT_SHOULDER], landmarks[L.RIGHT_ELBOW], landmarks[L.RIGHT_WRIST]);
    const rightShoulderAngle = calculateAngle(landmarks[L.RIGHT_HIP], landmarks[L.RIGHT_SHOULDER], landmarks[L.RIGHT_ELBOW]);
    const isRightArmReady = (
        Math.abs(rightElbowAngle - target.ELBOW) <= tolerance &&
        Math.abs(rightShoulderAngle - target.SHOULDER) <= tolerance
    );

    return isLeftArmReady && isRightArmReady;
}

/**
 * マッチングロジック (最終スコア計算) - 全身対応に更新
 */
function calculateMatchScore(currentLandmarks) {
    const challenge = CHALLENGES[currentChallengeIndex];
    const L = LANDMARK_INDICES;
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE;
    let totalScore = 0;
    let jointCount = 0;

    // --- 1. ARMチャレンジ (左手上げ, 右手上げ) の評価 ---
    if (challenge.targetType === 'ARM') {
        const side = challenge.evalJoints[0].includes('L') ? 'LEFT' : 'RIGHT';
        
        const S = L[`${side}_SHOULDER`];
        const E = L[`${side}_ELBOW`];
        const W = L[`${side}_WRIST`];
        const H = L[`${side}_HIP`];

        // 可視性チェック
        if (currentLandmarks[S].visibility < 0.7 || currentLandmarks[E].visibility < 0.7 || 
            currentLandmarks[W].visibility < 0.7 || currentLandmarks[H].visibility < 0.7) {
            return 0;
        }

        // 肘の角度 (肩-肘-手首)
        const currentElbowAngle = calculateAngle(currentLandmarks[S], currentLandmarks[E], currentLandmarks[W]);
        // 肩の角度 (腰-肩-肘)
        const currentShoulderAngle = calculateAngle(currentLandmarks[H], currentLandmarks[S], currentLandmarks[E]);

        const diffElbow = Math.abs(currentElbowAngle - target.ELBOW);
        const diffShoulder = Math.abs(currentShoulderAngle - target.SHOULDER);
        
        const scoreElbow = 100 * (1 - (diffElbow / tolerance.ELBOW));
        const scoreShoulder = 100 * (1 - (diffShoulder / tolerance.SHOULDER));

        totalScore += Math.max(0, scoreElbow);
        totalScore += Math.max(0, scoreShoulder);
        jointCount += 2;
    } 
    
    // --- 2. LEG_BALANCEチャレンジ (片足立ち) の評価 ---
    else if (challenge.targetType === 'LEG_BALANCE') {
        // 軸足の評価（右足立ちを想定）
        const R_K = L.RIGHT_KNEE;
        const R_A = L.RIGHT_ANKLE;
        const R_H = L.RIGHT_HIP;
        const L_H = L.LEFT_HIP;

        // 可視性チェック: 軸足の膝・足首と両腰
        if (currentLandmarks[R_K].visibility < 0.7 || currentLandmarks[R_A].visibility < 0.7 || 
            currentLandmarks[R_H].visibility < 0.7 || currentLandmarks[L_H].visibility < 0.7) {
            return 0;
        }

        // 2-1. 軸足の膝の伸び (腰-膝-足首)
        const currentKneeAngle = calculateAngle(currentLandmarks[R_H], currentLandmarks[R_K], currentLandmarks[R_A]);
        const diffKnee = Math.abs(currentKneeAngle - target.KNEE_STRAIGHT);
        const scoreKnee = 100 * (1 - (diffKnee / tolerance.KNEE));
        
        totalScore += Math.max(0, scoreKnee);
        jointCount += 1;

        // 2-2. 体幹の垂直安定性 (軸足のヒップと膝を結ぶ線の傾き)
        const angleRad = Math.atan2(currentLandmarks[R_H].x - currentLandmarks[R_K].x, currentLandmarks[R_H].y - currentLandmarks[R_K].y);
        const verticalAngle = Math.abs(angleRad * (180 / Math.PI)); 
        
        // 垂直(0度または180度)からのずれ
        const tiltDiff = Math.min(verticalAngle, Math.abs(180 - verticalAngle)); 
        
        const scoreTilt = 100 * (1 - (tiltDiff / tolerance.TILT));
        
        totalScore += Math.max(0, scoreTilt);
        jointCount += 1;
        
        // 2-3. 腰の水平バランスチェック（左右の腰のY座標の差が少ないほど良い）
        const hipDeltaY = Math.abs(currentLandmarks[R_H].y - currentLandmarks[L_H].y) * canvasElement.height; 
        
        // 20ピクセル以内のズレを100点として評価（補助的なバランス点）
        const hipBalanceScore = Math.max(0, 100 * (1 - (hipDeltaY / 20))); 
        
        totalScore += hipBalanceScore;
        jointCount += 1;
    }

    if (jointCount === 0) return 0;
    
    return Math.min(100, totalScore / jointCount); 
}

// =========================================================================
// 📐 ポーズガイド用データと描画関数 
// =========================================================================

/**
 * 目標ポーズのランドマーク座標を定義 (Canvasの正規化座標: 0.0〜1.0)
 * 座標は、画面下部中央付近に人が立っている状態を想定
 */
const TARGET_POSE_LANDMARKS = [
    // 0: 鼻, 1: 右目内側, ..., 10: 左口角 (顔は省略)
    null, null, null, null, null, null, null, null, null, null, null,
    // 11: 左肩 (L_SHOULDER)
    { x: 0.35, y: 0.45, z: 0, visibility: 0.9 },
    // 12: 右肩 (R_SHOULDER)
    { x: 0.65, y: 0.45, z: 0, visibility: 0.9 },
    // 13: 左肘 (L_ELBOW)
    { x: 0.3, y: 0.6, z: 0, visibility: 0.9 },
    // 14: 右肘 (R_ELBOW)
    { x: 0.7, y: 0.6, z: 0, visibility: 0.9 },
    // 15: 左手首 (L_WRIST)
    { x: 0.25, y: 0.75, z: 0, visibility: 0.9 },
    // 16: 右手首 (R_WRIST)
    { x: 0.75, y: 0.75, z: 0, visibility: 0.9 },
    // 17-22: 省略
    null, null, null, null, null, null,
    // 23: 左腰 (L_HIP)
    { x: 0.4, y: 0.65, z: 0, visibility: 0.9 },
    // 24: 右腰 (R_HIP)
    { x: 0.6, y: 0.65, z: 0, visibility: 0.9 },
    // 25: 左膝 (L_KNEE)
    { x: 0.4, y: 0.8, z: 0, visibility: 0.9 },
    // 26: 右膝 (R_KNEE)
    { x: 0.6, y: 0.8, z: 0, visibility: 0.9 },
    // 27: 左足首 (L_ANKLE)
    { x: 0.4, y: 0.95, z: 0, visibility: 0.9 },
    // 28: 右足首 (R_ANKLE)
    { x: 0.6, y: 0.95, z: 0, visibility: 0.9 },
];

/**
 * 現在のチャレンジに基づき、目標ポーズのランドマークを生成する
 */
function getTargetPoseLandmarks() {
    if (currentChallengeIndex >= CHALLENGES.length) return null;
    
    const challenge = CHALLENGES[currentChallengeIndex];
    // 基本のポーズをコピー
    const targetPose = JSON.parse(JSON.stringify(TARGET_POSE_LANDMARKS));
    const L = LANDMARK_INDICES;

    // チャレンジごとのポーズを上書き
    if (challenge.name === "左手を上げる") {
        // 左手を上空に
        targetPose[L.LEFT_ELBOW].y = 0.3;
        targetPose[L.LEFT_WRIST].y = 0.15;
        targetPose[L.LEFT_ELBOW].x = targetPose[L.LEFT_SHOULDER].x;
        targetPose[L.LEFT_WRIST].x = targetPose[L.LEFT_SHOULDER].x;
        // 右腕は自然に下げる
        targetPose[L.RIGHT_ELBOW].y = 0.6;
        targetPose[L.RIGHT_WRIST].y = 0.75;
    } else if (challenge.name === "右手を上げる") {
        // 右手を上空に
        targetPose[L.RIGHT_ELBOW].y = 0.3;
        targetPose[L.RIGHT_WRIST].y = 0.15;
        targetPose[L.RIGHT_ELBOW].x = targetPose[L.RIGHT_SHOULDER].x;
        targetPose[L.RIGHT_WRIST].x = targetPose[L.RIGHT_SHOULDER].x;
        // 左腕は自然に下げる
        targetPose[L.LEFT_ELBOW].y = 0.6;
        targetPose[L.LEFT_WRIST].y = 0.75;
    } else if (challenge.name === "片足立ち (右足軸)") {
        // 右足軸
        // 左足は持ち上げる (膝を曲げる)
        targetPose[L.LEFT_KNEE].y = 0.6;
        targetPose[L.LEFT_ANKLE].y = 0.4;
        targetPose[L.LEFT_ANKLE].x = 0.3; // 少し内側に曲げる
        // 両手を上空に
        targetPose[L.LEFT_ELBOW].y = 0.3;
        targetPose[L.LEFT_WRIST].y = 0.15;
        targetPose[L.LEFT_ELBOW].x = targetPose[L.LEFT_SHOULDER].x;
        targetPose[L.LEFT_WRIST].x = targetPose[L.LEFT_SHOULDER].x;
        targetPose[L.RIGHT_ELBOW].y = 0.3;
        targetPose[L.RIGHT_WRIST].y = 0.15;
        targetPose[L.RIGHT_ELBOW].x = targetPose[L.RIGHT_SHOULDER].x;
        targetPose[L.RIGHT_WRIST].x = targetPose[L.RIGHT_SHOULDER].x;
    }
    
    // 定義されたランドマークのみをフィルタリングして返す (MediaPipeのユーティリティ関数に渡すため、nullも含む元の配列を返す)
    // ただし、描画に必要なランドマークのみを含めたいので、フィルタリングはここでは行わない。
    return targetPose;
}

// =========================================================================
// ⏱️ チャレンジ管理ロジック
// =========================================================================

/**
 * チャレンジをリセットし、次のステージへ進む
 */
function resetChallenge(nextStage = false) {
    isPoseFixed = false;
    finalPoseLandmarks = null;
    isChallengeStarted = false;
    isInPreparationPhase = false; 
    matchScoreElement.textContent = '-- %';
    matchScoreElement.style.color = '#4CAF50'; 

    if (nextStage) {
        currentChallengeIndex++;
    }

    if (currentChallengeIndex < CHALLENGES.length) {
        const nextChallenge = CHALLENGES[currentChallengeIndex];
        guideMessageElement.textContent = `カメラ起動完了！チャレンジ開始のため、両手を垂直に上げてポーズを維持してください。`;
        timerDisplayElement.classList.remove('show-timer');
        
        // チャレンジ名を表示
        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = `▶️ ${nextChallenge.name}`;
        }
        // ★ デバッグボタンを再有効化
        if (debugStartButton) {
            debugStartButton.disabled = false;
            debugStartButton.style.backgroundColor = '#007bff';
        }
    } else {
        showFinalResults();
        //最終結果表示時、チャレンジ名をクリア
        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = '全チャレンジ完了！';
        }
        // ★ デバッグボタンを無効化
        if (debugStartButton) {
            debugStartButton.disabled = true;
            debugStartButton.style.backgroundColor = '#6c757d';
        }
    }
}

/**
 * 最終結果を表示する (変更なし)
 */
function showFinalResults() {
    let totalScore = 0;
    let scoreList = "";
    
    CHALLENGES.forEach((c) => {
        totalScore += c.score;
        scoreList += `${c.name}: ${c.score.toFixed(1)}%\n`;
    });
    
    const averageScore = totalScore / CHALLENGES.length;
    matchScoreElement.textContent = averageScore.toFixed(1) + ' % (平均)';
    
    if (averageScore > 90) {
        matchScoreElement.style.color = '#4CAF50';
        guideMessageElement.innerHTML = `🎉 **全チャレンジ完了！** 平均スコア: ${averageScore.toFixed(1)}%<br>素晴らしいパーフェクト達成です！`;
    } else {
        matchScoreElement.style.color = '#FFC107';
        guideMessageElement.innerHTML = `**全チャレンジ完了！** 平均スコア: ${averageScore.toFixed(1)}%<br>結果をコンソールで確認し、もう一度チャレンジしましょう！`;
    }

    console.log("--- FINAL CHALLENGE RESULTS ---");
    console.log(scoreList);
    console.log(`Average Score: ${averageScore.toFixed(1)}%`);
    console.log("------------------------------");
}

/**
 * 準備フェーズを開始する
 */
function startPreparationPhase() {
    if (isChallengeStarted || isInPreparationPhase) return;
    isInPreparationPhase = true;

    // ★ デバッグボタンを無効化
    if (debugStartButton) {
        debugStartButton.disabled = true;
        debugStartButton.style.backgroundColor = '#6c757d';
    }

    const currentChallenge = CHALLENGES[currentChallengeIndex];
    guideMessageElement.textContent = `✅ ${currentChallenge.message} ポーズを確認！そのままでお待ちください...`;
    
    setTimeout(() => {
        isInPreparationPhase = false;
        startChallengeTimer();
    }, PREP_DELAY_SECONDS * 1000);
}

/**
 * カウントダウンタイマーを開始する 
 */
function startChallengeTimer() {
    if (isChallengeStarted) return;
    isChallengeStarted = true;

    timerDisplayElement.classList.add('show-timer');
    guideMessageElement.textContent = '⏱️ 計測開始！';

    const startTime = Date.now();

    challengeTimerId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);

        if (elapsed < COUNTDOWN_SECONDS) {
            const remaining = COUNTDOWN_SECONDS - elapsed;
            timerDisplayElement.textContent = remaining;
            guideMessageElement.textContent = `ポーズを取る準備！残り ${remaining} 秒！`;
        } else if (elapsed < TOTAL_DELAY_SECONDS) {
            const holdTime = elapsed - COUNTDOWN_SECONDS;
            timerDisplayElement.textContent = 'GO!';
            guideMessageElement.textContent = `ポーズを維持してください！測定中... ${holdTime + 1} / ${HOLD_SECONDS} 秒`;
        } else {
            clearInterval(challengeTimerId);
            challengeTimerId = null; 
            isPoseFixed = true;
            timerDisplayElement.classList.remove('show-timer');
            guideMessageElement.textContent = 'ポーズ確定！最終スコアを計算中です。';
        }
    }, 1000);
}


// -------------------------------------------------------------------------
// MediaPipeとカメラの初期化
// -------------------------------------------------------------------------
const pose = new Pose({
    locateFile: (file) => {
        // return `./lib/${file}`
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});
pose.setOptions({
    modelComplexity: 1, 
    smoothLandmarks: true
});
pose.onResults(onResults);

const { Camera } = window;
const camera = new Camera(videoElement, {
    // ★ 修正後の onFrame ロジック
    onFrame: async () => {
        // finalPoseLandmarksがセットされたら、MediaPipeへの送信を停止し、再描画のみを行う
        if (finalPoseLandmarks) {
            onResults({ image: videoElement, poseLandmarks: finalPoseLandmarks });
        } 
        // ポーズ固定中 (isPoseFixed=true) でも、finalPoseLandmarksがまだ設定されていない最初の1回は pose.send を実行させる
        else if (isPoseFixed) {
            await pose.send({ image: videoElement });
        }
        // チャレンジ開始前または計測中は通常通り pose.send を実行
        else {
            await pose.send({ image: videoElement });
        }
    },
    width: 640,
    height: 480
});

// カメラ起動処理
camera.start().then(() => {
    guideMessageElement.textContent = `カメラ起動完了！チャレンジ開始のため、両手をゆっくり垂直に上げてポーズを維持してください。`;
    //カメラ起動時に最初のチャレンジ名を表示
    if (currentChallengeIndex < CHALLENGES.length && currentChallengeNameElement) {
        currentChallengeNameElement.textContent = `▶️ ${CHALLENGES[currentChallengeIndex].name}`;
    }
}).catch(error => {
    guideMessageElement.textContent = `エラー: カメラの起動に失敗しました。アクセスを許可してください。 (${error.name})`;
    console.error("Camera start failed:", error);
});


// 🚨 デバッグ用ボタンにイベントリスナーを追加
if (debugStartButton) {
    debugStartButton.addEventListener('click', () => {
        if (currentChallengeIndex < CHALLENGES.length && !isChallengeStarted && !isInPreparationPhase) {
            console.log("DEBUG: チャレンジを強制スタートします。");
            // isStartPoseAchieved() のチェックをスキップして、直接準備フェーズを開始
            startPreparationPhase();
        } else if (currentChallengeIndex >= CHALLENGES.length) {
            console.log("DEBUG: 全チャレンジ完了済みです。");
            guideMessageElement.textContent = "全チャレンジが完了しています。ページをリロードしてください。";
        } else {
             console.log("DEBUG: チャレンジはすでに進行中または準備中です。");
        }
    });
}


/**
 * MediaPipeからの姿勢検出結果を受け取るコールバック
 */
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalCompositeOperation = 'source_over';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // 🚨 ランドマーク描画前にピクトグラムを描画
    // チャレンジ開始後、ポーズが固定される前のみガイドを表示
    if (currentChallengeIndex < CHALLENGES.length && isChallengeStarted && !isPoseFixed) {
        const targetLandmarks = getTargetPoseLandmarks();
        if (targetLandmarks) {
            // ユーザーのポーズではなく目標ポーズを描画
            drawConnectors(canvasCtx, targetLandmarks, window.POSE_CONNECTIONS,
                           { color: GUIDE_LINE_COLOR, lineWidth: 8 }); 
            drawLandmarks(canvasCtx, targetLandmarks,
                          { color: GUIDE_DOT_COLOR, lineWidth: 4, radius: 8 });
        }
    }


    if (results.poseLandmarks) {
        
        // 1. チャレンジ開始チェック
        if (!isChallengeStarted && !isInPreparationPhase && currentChallengeIndex < CHALLENGES.length && isStartPoseAchieved(results.poseLandmarks)) {
            startPreparationPhase();
        }

        // 2. 🚨 ポーズ固定の瞬間、データを保存 (確定処理)
        if (isPoseFixed && !finalPoseLandmarks) {
            
            // ★ 修正点1: 確定処理に入ったら、まずポーズデータを固定する
            finalPoseLandmarks = JSON.parse(JSON.stringify(results.poseLandmarks));

            // ★ 修正点2: タイマーが残っていればここで確実に停止する
            if (challengeTimerId) {
                clearInterval(challengeTimerId);
                challengeTimerId = null;
            }

            const score = calculateMatchScore(finalPoseLandmarks);
            CHALLENGES[currentChallengeIndex].score = score;
            
            matchScoreElement.textContent = score.toFixed(1) + ' % (FINAL)';

            if (score > 90) {
                matchScoreElement.style.color = '#4CAF50'; 
                guideMessageElement.textContent = `🌟 ${CHALLENGES[currentChallengeIndex].name} 完了！パーフェクト達成です！`;
            } else if (score > 70) {
                matchScoreElement.style.color = '#FFC107';
                guideMessageElement.textContent = `${CHALLENGES[currentChallengeIndex].name} 完了！もう少しで目標達成でした！`;
            } else {
                matchScoreElement.style.color = '#F44336';
                guideMessageElement.textContent = `${CHALLENGES[currentChallengeIndex].name} 完了。惜しかったです！`;
            }

            // 1秒後に次のチャレンジへ移行または終了
            setTimeout(() => {
                resetChallenge(true);
            }, 1000); 
            
            // ★ 修正点3: 確定処理が完了したら、これ以上 onResults 内のスコアリングを続行しない
            return; 
        }

        // 3. 描画とスコア表示の更新
        const drawingLandmarks = finalPoseLandmarks || results.poseLandmarks;
        
        const lineColor = isPoseFixed ? '#FFD700' : '#00FF00'; 
        const dotColor = isPoseFixed ? '#FFA500' : '#FF0000'; 
        
        // ユーザーのポーズを描画
        drawConnectors(canvasCtx, drawingLandmarks, window.POSE_CONNECTIONS,
                       { color: lineColor, lineWidth: 4 }); 
        drawLandmarks(canvasCtx, drawingLandmarks,
                      { color: dotColor, lineWidth: 2, radius: 4 });

        if (!finalPoseLandmarks && isChallengeStarted) {
             const score = calculateMatchScore(results.poseLandmarks);
             matchScoreElement.textContent = score.toFixed(1) + ' %';
             
             if (score > 80) {
                matchScoreElement.style.color = '#4CAF50';
             } else if (score > 50) {
                matchScoreElement.style.color = '#FFA500';
             } else {
                matchScoreElement.style.color = '#F44336';
             }
        }
    }
    
    canvasCtx.restore();
}