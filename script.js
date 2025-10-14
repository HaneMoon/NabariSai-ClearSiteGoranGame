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
const currentChallengeNameElement = document.getElementById('current-challenge-name');

// デバッグボタンの要素を取得
const debugStartButton = document.getElementById('debug-start-button');

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
 * 3つのランドマークから角度を計算 (変更なし)
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
 * 起動トリガー用のポーズが取られているか判定する (両腕垂直上げ) (変更なし)
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
 * マッチングロジック (最終スコア計算) - 全身対応に更新 (変更なし)
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
// ⏱️ チャレンジ管理ロジック
// =========================================================================

/**
 * チャレンジをリセットし、次のステージへ進む
 */
function resetChallenge(nextStage = false) {
    // isPoseFixedはonResults内で解除されるべきだが、念の為ここでも確認
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
        // 初期メッセージも、チャレンジ名を合わせて表示
        guideMessageElement.textContent = `カメラ起動完了！チャレンジ開始のため、両手を垂直に上げてポーズを維持してください。`;
        timerDisplayElement.classList.remove('show-timer');
        
        // チャレンジ名を表示
        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = `▶️ ${nextChallenge.name}`;
        }
    } else {
        showFinalResults();
        // 最終結果表示時、チャレンジ名をクリア
        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = '全チャレンジ完了！';
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

    const currentChallenge = CHALLENGES[currentChallengeIndex];
    guideMessageElement.textContent = `✅ ${currentChallenge.message} ポーズを確認！そのままでお待ちください...`;
    
    setTimeout(() => {
        isInPreparationPhase = false;
        startChallengeTimer();
    }, PREP_DELAY_SECONDS * 1000);
}

// チャレンジ強制開始関数
function forceStartChallenge() {
    // 既にチャレンジ中ではないか、最終結果表示中でないかを確認
    if (isChallengeStarted || currentChallengeIndex >= CHALLENGES.length) {
        console.warn("チャレンジは既に進行中か、全て完了しています。");
        // もし完了しているなら、最初のチャレンジにリセット
        if (currentChallengeIndex >= CHALLENGES.length) {
            currentChallengeIndex = 0;
            resetChallenge(false);
            // resetChallengeがメッセージを更新するため、その後でタイマーを開始
        } else {
             return;
        }
    }

    // 準備フェーズをスキップし、タイマーを直接開始
    isInPreparationPhase = false; 
    startChallengeTimer();
    console.log(`デバッグモード: チャレンジ ${CHALLENGES[currentChallengeIndex].name} を強制開始しました。`);
}


/**
 * カウントダウンタイマーを開始する 
 */
function startChallengeTimer() {
    if (isChallengeStarted) return;
    isChallengeStarted = true;

    timerDisplayElement.classList.add('show-timer');
    
    // タイマー開始時もチャレンジ名を再確認して表示を維持
    const currentChallenge = CHALLENGES[currentChallengeIndex];
    if (currentChallengeNameElement) {
        currentChallengeNameElement.textContent = `▶️ ${currentChallenge.name}`;
    }

    const startTime = Date.now();

    challengeTimerId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        
        // タイマー実行中は、チャレンジ名を常に上部に表示し、ガイドメッセージはタイマーに集中させる
        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = `▶️ ${currentChallenge.name}`;
        }

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
            
            // ★ 修正箇所: ポーズが固定されなかった場合 (finalPoseLandmarksがnull) の強制終了処理を追加
            if (!finalPoseLandmarks) {
                // スコアを0%として強制確定させる
                CHALLENGES[currentChallengeIndex].score = 0;
                matchScoreElement.textContent = '0.0 % (FINAL)';
                matchScoreElement.style.color = '#F44336';
                guideMessageElement.textContent = `${CHALLENGES[currentChallengeIndex].name} 完了。ポーズが確定できませんでした。`;
                
                if (currentChallengeNameElement) {
                    currentChallengeNameElement.textContent = `❌ ${CHALLENGES[currentChallengeIndex].name}`;
                }

                // 1秒後に次のチャレンジへ移行または終了
                setTimeout(() => {
                    resetChallenge(true);
                }, 1000);
            } else {
                // 通常通りポーズが確定した場合の処理
                isPoseFixed = true;
                timerDisplayElement.classList.remove('show-timer');
                guideMessageElement.textContent = 'ポーズ確定！最終スコアを計算中です。';
            }
        }
    }, 1000);
}


// -------------------------------------------------------------------------
// MediaPipeとカメラの初期化
// -------------------------------------------------------------------------
const pose = new Pose({
    locateFile: (file) => {
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
    onFrame: async () => {
        // ポーズ固定が解除された直後 (finalPoseLandmarksがnull) も検出を継続する
        if (!isPoseFixed || (isPoseFixed && !finalPoseLandmarks)) {
             await pose.send({ image: videoElement });
        } else if (isPoseFixed && finalPoseLandmarks) {
            // ポーズが確定し、ランドマークも確定している場合は再描画のみ
            onResults({ image: videoElement, poseLandmarks: finalPoseLandmarks });
        }
    },
    width: 640,
    height: 480
});

// カメラ起動処理
camera.start().then(() => {
    // 初期表示のメッセージをよりシンプルに
    guideMessageElement.textContent = `開始準備OK！両手を垂直に上げてチャレンジを開始してください。`;
    if (currentChallengeIndex < CHALLENGES.length && currentChallengeNameElement) {
        currentChallengeNameElement.textContent = `▶️ ${CHALLENGES[currentChallengeIndex].name}`;
    }
    
    // ボタンにイベントリスナーを追加
    if (debugStartButton) {
        debugStartButton.addEventListener('click', forceStartChallenge);
    }

}).catch(error => {
    guideMessageElement.textContent = `エラー: カメラの起動に失敗しました。アクセスを許可してください。 (${error.name})`;
    console.error("Camera start failed:", error);
});


/**
 * MediaPipeからの姿勢検出結果を受け取るコールバック
 */
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalCompositeOperation = 'source_over';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        
        // 1. チャレンジ開始チェック
        if (!isChallengeStarted && !isInPreparationPhase && currentChallengeIndex < CHALLENGES.length && isStartPoseAchieved(results.poseLandmarks)) {
            startPreparationPhase();
        }

        // 2. ポーズ固定の瞬間、データを保存 (確定処理)
        if (isPoseFixed && !finalPoseLandmarks) {
            finalPoseLandmarks = JSON.parse(JSON.stringify(results.poseLandmarks));
            
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
            
            // ポーズ確定時もチャレンジ名を維持
             if (currentChallengeNameElement) {
                 currentChallengeNameElement.textContent = `✅ ${CHALLENGES[currentChallengeIndex].name}`;
             }

            // 1秒後に次のチャレンジへ移行または終了
            setTimeout(() => {
                resetChallenge(true);
            }, 1000); 
            
            // ★ 修正箇所: onResultsの外でisPoseFixedを操作しない
        }

        // 3. 描画とスコア表示の更新
        const drawingLandmarks = finalPoseLandmarks || results.poseLandmarks;
        
        const lineColor = isPoseFixed ? '#FFD700' : '#00FF00'; 
        const dotColor = isPoseFixed ? '#FFA500' : '#FF0000'; 
        
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