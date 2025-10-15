// 必要な定数を challenges.js からインポート
import {
    ALL_CHALLENGES,
    CURRENT_CHALLENGES, // ★ 修正点1: 実行するチャレンジ配列
    TARGET_ANGLES,
    TOLERANCE,
    LANDMARKS as LANDMARK_INDICES
} from './challenges.js';

// -------------------------------------------------------------------------
// グローバル定数と初期化
// -------------------------------------------------------------------------

const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
const matchScoreElement = document.getElementById('match-score');
const guideMessageElement = document.getElementById('guide-message');
const timerDisplayElement = document.getElementById('timer-display');
const currentChallengeNameElement = document.getElementById('current-challenge-name');
const debugStartButton = document.getElementById('debug-start-button');

canvasElement.width = 640;
canvasElement.height = 480;

// 状態管理のための変数
let currentChallengeIndex = 0;
let isPoseFixed = false;
let finalPoseLandmarks = null;
let isChallengeStarted = false;
let isInPreparationPhase = false; 
// ★ 修正点2: 現在有効なスタートポーズを追跡 ('VERTICAL' or 'T_POSE')
let currentStartPoseType = 'VERTICAL'; 

const COUNTDOWN_SECONDS = 3;
const HOLD_SECONDS = 5;
const PREP_DELAY_SECONDS = 1.5;
const TOTAL_DELAY_SECONDS = COUNTDOWN_SECONDS + HOLD_SECONDS;
let challengeTimerId = null;

// -------------------------------------------------------------------------
// ★ 修正点3: チャレンジの初期化とランダム選択ロジック
// -------------------------------------------------------------------------

/**
 * 全チャレンジから指定数（5個）をランダムに選択し、CURRENT_CHALLENGESを初期化する
 */
function initializeChallenges() {
    const NUM_CHALLENGES = 5;
    
    // 既存のチャレンジリストをクリア
    CURRENT_CHALLENGES.length = 0;
    
    // シャッフル用の一時配列
    let availableChallenges = [...ALL_CHALLENGES];
    
    // 乱数で5つのチャレンジを選択
    for (let i = 0; i < NUM_CHALLENGES; i++) {
        if (availableChallenges.length === 0) break;
        
        const randomIndex = Math.floor(Math.random() * availableChallenges.length);
        const selectedChallenge = availableChallenges.splice(randomIndex, 1)[0];
        
        // スコアを初期化して実行リストに追加
        CURRENT_CHALLENGES.push({ ...selectedChallenge, score: null });
    }
}


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

// ★ 修正点4: スタートポーズの判定ロジックを共通化
function isArmPoseAchieved(landmarks, shoulderTarget, elbowTarget, tolerance) {
    const L = LANDMARK_INDICES;

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
        Math.abs(leftElbowAngle - elbowTarget) <= tolerance &&
        Math.abs(leftShoulderAngle - shoulderTarget) <= tolerance
    );

    const rightElbowAngle = calculateAngle(landmarks[L.RIGHT_SHOULDER], landmarks[L.RIGHT_ELBOW], landmarks[L.RIGHT_WRIST]);
    const rightShoulderAngle = calculateAngle(landmarks[L.RIGHT_HIP], landmarks[L.RIGHT_SHOULDER], landmarks[L.RIGHT_ELBOW]);
    const isRightArmReady = (
        Math.abs(rightElbowAngle - elbowTarget) <= tolerance &&
        Math.abs(rightShoulderAngle - shoulderTarget) <= tolerance
    );

    return isLeftArmReady && isRightArmReady;
}

/**
 * 起動トリガー用のポーズ (両腕垂直上げ) が取られているか判定する
 */
function isVerticalStartPoseAchieved(landmarks) {
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE.START_TOLERANCE_VERTICAL;
    return isArmPoseAchieved(landmarks, target.SHOULDER, target.ELBOW, tolerance);
}

/**
 * ★ 修正点5: 起動トリガー用のポーズ (T字ポーズ) が取られているか判定する
 */
function isTPoseStartPoseAchieved(landmarks) {
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE.START_TOLERANCE_T_POSE;
    return isArmPoseAchieved(landmarks, target.T_POSE_SHOULDER, target.T_POSE_ELBOW, tolerance);
}


/**
 * マッチングロジック (最終スコア計算) - 不正ポーズチェックロジックを最終修正
 */
function calculateMatchScore(currentLandmarks) {
    // ★ 修正点6: CURRENT_CHALLENGES を参照するように変更
    const challenge = CURRENT_CHALLENGES[currentChallengeIndex];
    const L = LANDMARK_INDICES;
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE;
    let totalScore = 0;
    let jointCount = 0;

    // --- 1. ARMチャレンジ (左手上げ, 右手上げ) の評価 ---
    if (challenge.targetType === 'ARM') {
        // ... (ARMチャレンジの評価ロジックは変更なし) ...
        const side = challenge.evalJoints[0].includes('L') ? 'LEFT' : 'RIGHT';
        const otherSide = side === 'LEFT' ? 'RIGHT' : 'LEFT'; // 評価対象外の腕 (ユーザーが下ろすべき腕)
        
        const S = L[`${side}_SHOULDER`];
        const E = L[`${side}_ELBOW`];
        const W = L[`${side}_WRIST`];
        const H = L[`${side}_HIP`];

        // 評価対象外の腕のランドマーク
        const otherS = L[`${otherSide}_SHOULDER`];
        const otherE = L[`${otherSide}_ELBOW`];
        const otherW = L[`${otherSide}_WRIST`];
        const otherH = L[`${otherSide}_HIP`];
        
        // 可視性チェックの閾値
        const VISIBILITY_THRESHOLD = 0.5; 
        
        // 評価対象の腕の可視性チェック
        const isTargetArmVisible = currentLandmarks[S] && currentLandmarks[E] && 
                                  currentLandmarks[W] && currentLandmarks[H] &&
                                  currentLandmarks[S].visibility > VISIBILITY_THRESHOLD && 
                                  currentLandmarks[E].visibility > VISIBILITY_THRESHOLD &&
                                  currentLandmarks[W].visibility > VISIBILITY_THRESHOLD;


        // 評価対象外の腕が検出されているか
        const isOtherArmVisible = currentLandmarks[otherS] && currentLandmarks[otherE] && 
                                  currentLandmarks[otherW] && currentLandmarks[otherH];

        // 角度計算（不正チェックとスコア計算の両方に利用）
        const currentTargetElbowAngle = calculateAngle(currentLandmarks[S], currentLandmarks[E], currentLandmarks[W]);
        const currentTargetShoulderAngle = calculateAngle(currentLandmarks[H], currentLandmarks[S], currentLandmarks[E]);
        
        // 不正判定の基準を厳しくする 
        const targetTolerance = 5; 

        // 評価対象外の腕が検出され、かつ上がっているか
        let isOtherArmUp = false;
        if (isOtherArmVisible) { 
            const otherShoulderAngle = calculateAngle(currentLandmarks[otherH], currentLandmarks[otherS], currentLandmarks[otherE]);
            const otherElbowAngle = calculateAngle(currentLandmarks[otherS], currentLandmarks[otherE], currentLandmarks[otherW]);
            
            // 評価対象外の腕が「ほぼ完璧に上がっている」場合のみ不正と判定
            isOtherArmUp = (
                Math.abs(otherShoulderAngle - target.SHOULDER) <= targetTolerance &&
                Math.abs(otherElbowAngle - target.ELBOW) <= targetTolerance
            );
        }
        
        // 🚨 不正判定ロジック最終強化 🚨
        if (isOtherArmUp) {
            return 0;
        }

        if (!isTargetArmVisible) {
            return 0;
        }

        const currentElbowAngle = currentTargetElbowAngle;
        const currentShoulderAngle = currentTargetShoulderAngle;

        const diffElbow = Math.abs(currentElbowAngle - target.ELBOW);
        const diffShoulder = Math.abs(currentShoulderAngle - target.SHOULDER);
        
        const scoreElbow = 100 * (1 - (diffElbow / tolerance.ELBOW));
        const scoreShoulder = 100 * (1 - (diffShoulder / tolerance.SHOULDER));

        totalScore += Math.max(0, scoreElbow);
        totalScore += Math.max(0, scoreShoulder);
        jointCount += 2;
    } 
    
    // --- 1-B. L_SHAPE_ARMSチャレンジ (両腕L字ポーズ) の評価 ---  
    else if (challenge.targetType === 'L_SHAPE_ARMS') {
        const sides = ['LEFT', 'RIGHT'];
        const VISIBILITY_THRESHOLD = 0.5;
        const targetShoulder = target.L_SHAPE_SHOULDER; // 90度
        const targetElbow = target.L_SHAPE_ELBOW;       // 90度
        const poseTolerance = tolerance.L_SHAPE_TOLERANCE; // L字ポーズ専用の許容誤差を使用
        
        for (const side of sides) {
            const S = L[`${side}_SHOULDER`];
            const E = L[`${side}_ELBOW`];
            const W = L[`${side}_WRIST`];
            const H = L[`${side}_HIP`];
            
            // 可視性チェック
            const isArmVisible = currentLandmarks[S] && currentLandmarks[E] && 
                                  currentLandmarks[W] && currentLandmarks[H] &&
                                  currentLandmarks[S].visibility > VISIBILITY_THRESHOLD && 
                                  currentLandmarks[E].visibility > VISIBILITY_THRESHOLD &&
                                  currentLandmarks[W].visibility > VISIBILITY_THRESHOLD;

            if (!isArmVisible) {
                return 0; // 片腕でも見えなければ0点
            }

            // 角度計算
            const currentElbowAngle = calculateAngle(currentLandmarks[S], currentLandmarks[E], currentLandmarks[W]);
            const currentShoulderAngle = calculateAngle(currentLandmarks[H], currentLandmarks[S], currentLandmarks[E]);
            
            // スコア計算
            const diffElbow = Math.abs(currentElbowAngle - targetElbow);
            const diffShoulder = Math.abs(currentShoulderAngle - targetShoulder);
            
            const scoreElbow = 100 * (1 - (diffElbow / poseTolerance));
            const scoreShoulder = 100 * (1 - (diffShoulder / poseTolerance));

            totalScore += Math.max(0, scoreElbow);
            totalScore += Math.max(0, scoreShoulder);
            jointCount += 2;
        }

    }
    
    // --- 2. LEG_BALANCEチャレンジ (片足立ち) の評価 ---
    // else if (challenge.targetType === 'LEG_BALANCE') {
    //     // ... ロジックは削除済み ...
    // }
    
    // --- 3. その他のチャレンジ (新しく追加されたポーズ) の評価 ---
    // else if (challenge.targetType === 'SQUAT' || challenge.targetType === 'WARRIOR') {
    //     // ... ロジックは削除済み ...
    // }

    // ★ 修正点7: 以前のコードで残っていた冗長なチェックを削除し、ジョイントカウントが0の場合のみ0を返すようにシンプル化
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
    isPoseFixed = false; 
    finalPoseLandmarks = null;
    isChallengeStarted = false;
    isInPreparationPhase = false; 
    matchScoreElement.textContent = '-- %';
    matchScoreElement.style.color = '#4CAF50'; 

    if (nextStage) {
        currentChallengeIndex++;
    }

    // ★ 修正点8: CURRENT_CHALLENGES を参照
    if (currentChallengeIndex < CURRENT_CHALLENGES.length) {
        const nextChallenge = CURRENT_CHALLENGES[currentChallengeIndex];
        
        // ★ 修正点9: 次のチャレンジの種類に応じて、次のスタートポーズとメッセージを設定
        const nextStartChallenge = CURRENT_CHALLENGES[currentChallengeIndex]
        
        // ARMチャレンジとL_SHAPE_ARMSの場合は垂直スタート
        if (nextStartChallenge.targetType === 'ARM' || nextStartChallenge.targetType === 'L_SHAPE_ARMS') {
             currentStartPoseType = 'VERTICAL';
             guideMessageElement.textContent = `カメラ起動完了！チャレンジ開始のため、両手を垂直に上げてポーズを維持してください。`;
        } else {
             // 予期せぬチャレンジタイプが来た場合のフォールバックを垂直スタートに統一
             currentStartPoseType = 'VERTICAL'; 
             guideMessageElement.textContent = `カメラ起動完了！チャレンジ開始のため、両手を垂直に上げてポーズを維持してください。`;
        }
        
        timerDisplayElement.classList.remove('show-timer');
        
        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = `▶️ ${nextChallenge.name}`;
        }
    } else {
        showFinalResults();
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
    
    // ★ 修正点10: CURRENT_CHALLENGES を参照
    CURRENT_CHALLENGES.forEach((c) => {
        totalScore += c.score;
        scoreList += `${c.name}: ${c.score.toFixed(1)}%\n`;
    });
    
    const averageScore = totalScore / CURRENT_CHALLENGES.length;
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

    // ★ 修正点11: CURRENT_CHALLENGES を参照
    const currentChallenge = CURRENT_CHALLENGES[currentChallengeIndex];
    guideMessageElement.textContent = `✅ ${currentChallenge.message.replace(/【チャレンジ\d\/\d】/, '')} ポーズを確認！そのままでお待ちください...`;
    
    setTimeout(() => {
        isInPreparationPhase = false;
        startChallengeTimer();
    }, PREP_DELAY_SECONDS * 1000);
}

// チャレンジ強制開始関数
function forceStartChallenge() {
    // ★ 修正点12: CURRENT_CHALLENGES の長さを参照
    if (isChallengeStarted || currentChallengeIndex >= CURRENT_CHALLENGES.length) {
        console.warn("チャレンジは既に進行中か、全て完了しています。");
        if (currentChallengeIndex >= CURRENT_CHALLENGES.length) {
            currentChallengeIndex = 0;
            initializeChallenges(); // 完了時はリストを再生成
            resetChallenge(false);
        } else {
             return;
        }
    }

    isInPreparationPhase = false; 
    startChallengeTimer();
    console.log(`デバッグモード: チャレンジ ${CURRENT_CHALLENGES[currentChallengeIndex].name} を強制開始しました。`);
}


/**
 * カウントダウンタイマーを開始する 
 */
function startChallengeTimer() {
    if (isChallengeStarted) return;
    isChallengeStarted = true;

    timerDisplayElement.classList.add('show-timer');
    
    // ★ 修正点13: CURRENT_CHALLENGES を参照
    const currentChallenge = CURRENT_CHALLENGES[currentChallengeIndex];
    if (currentChallengeNameElement) {
        currentChallengeNameElement.textContent = `▶️ ${currentChallenge.name}`;
    }

    const startTime = Date.now();

    challengeTimerId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        
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
            
            // ★ 修正点14: CURRENT_CHALLENGES を参照
            if (!finalPoseLandmarks) {
                CURRENT_CHALLENGES[currentChallengeIndex].score = 0;
                matchScoreElement.textContent = '0.0 % (FINAL)';
                matchScoreElement.style.color = '#F44336';
                guideMessageElement.textContent = `${CURRENT_CHALLENGES[currentChallengeIndex].name} 完了。ポーズが確定できませんでした。`;
                
                if (currentChallengeNameElement) {
                    currentChallengeNameElement.textContent = `❌ ${CURRENT_CHALLENGES[currentChallengeIndex].name}`;
                }

                setTimeout(() => {
                    resetChallenge(true);
                }, 1000);
            } else {
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
        if (isPoseFixed && finalPoseLandmarks) {
            return;
        }
        
        await pose.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

// カメラ起動処理
camera.start().then(() => {
    // ★ 修正点15: チャレンジリストを初期化
    initializeChallenges(); 
    
    // 初期メッセージは最初のチャレンジに応じて設定
    resetChallenge(false);
    
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
        // ★ 修正点16: スタートポーズの判定ロジックを分岐
        let isStartPoseReady = false;
        
        if (currentStartPoseType === 'VERTICAL') {
            isStartPoseReady = isVerticalStartPoseAchieved(results.poseLandmarks);
        } else if (currentStartPoseType === 'T_POSE') {
            isStartPoseReady = isTPoseStartPoseAchieved(results.poseLandmarks);
        }
        
        if (!isChallengeStarted && !isInPreparationPhase && currentChallengeIndex < CURRENT_CHALLENGES.length && isStartPoseReady) {
            startPreparationPhase();
        }

        // 2. ポーズ固定の瞬間、データを保存 (確定処理)
        if (isPoseFixed && !finalPoseLandmarks) {
            finalPoseLandmarks = JSON.parse(JSON.stringify(results.poseLandmarks));
            
            const score = calculateMatchScore(finalPoseLandmarks);
            // ★ 修正点17: CURRENT_CHALLENGES を参照
            CURRENT_CHALLENGES[currentChallengeIndex].score = score;
            
            matchScoreElement.textContent = score.toFixed(1) + ' % (FINAL)';

            if (score > 90) {
                matchScoreElement.style.color = '#4CAF50'; 
                guideMessageElement.textContent = `🌟 ${CURRENT_CHALLENGES[currentChallengeIndex].name} 完了！パーフェクト達成です！`;
            } else if (score > 70) {
                matchScoreElement.style.color = '#FFC107';
                guideMessageElement.textContent = `${CURRENT_CHALLENGES[currentChallengeIndex].name} 完了！もう少しで目標達成でした！`;
            } else {
                matchScoreElement.style.color = '#F44336';
                guideMessageElement.textContent = `${CURRENT_CHALLENGES[currentChallengeIndex].name} 完了。惜しかったです！`;
            }
            
             if (currentChallengeNameElement) {
                 currentChallengeNameElement.textContent = `✅ ${CURRENT_CHALLENGES[currentChallengeIndex].name}`;
             }

            setTimeout(() => {
                resetChallenge(true);
            }, 1000); 
        }

        // 3. 描画とスコア表示の更新
        const drawingLandmarksToUse = finalPoseLandmarks || results.poseLandmarks;

        const lineColor = finalPoseLandmarks ? '#FFD700' : '#00FF00'; // 固定ポーズは黄色
        const dotColor = finalPoseLandmarks ? '#FFA500' : '#FF0000'; // 固定ポーズはオレンジ
        
        drawConnectors(canvasCtx, drawingLandmarksToUse, window.POSE_CONNECTIONS,
                       { color: lineColor, lineWidth: 4 }); 
        drawLandmarks(canvasCtx, drawingLandmarksToUse,
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