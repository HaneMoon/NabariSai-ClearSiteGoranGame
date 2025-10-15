// 必要な定数を challenges.js からインポート
import {
    ALL_CHALLENGES,
    CURRENT_CHALLENGES, // 実行するチャレンジ配列
    VERTICAL_CHALLENGES, // ★ 変更点1: 垂直ポーズグループをインポート
    T_POSE_CHALLENGES, // ★ 変更点1: T字ポーズグループをインポート
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
let currentLandmarksSnapshot = null; // ★ 変更点A: リアルタイムスコア計算用のポーズスナップショット
let currentChallengeIndex = 0;
let isPoseFixed = false; // ★ 変更点A: スコア確定ロジックをタイマーに移すため、この変数は描画判定にのみ使用
let finalPoseLandmarks = null;
let isChallengeStarted = false;
let isInPreparationPhase = false; 
let currentStartPoseType = 'VERTICAL'; 
let isWaitingForStartPose = true; 

const COUNTDOWN_SECONDS = 3;
const HOLD_SECONDS = 5;
const PREP_DELAY_SECONDS = 1.5;
const TOTAL_DELAY_SECONDS = COUNTDOWN_SECONDS + HOLD_SECONDS;
let challengeTimerId = null;

// -------------------------------------------------------------------------
// ★ 修正点3: チャレンジの初期化とランダム選択ロジック
// -------------------------------------------------------------------------

/**
 * チャレンジリストをクリアし、初期待機状態に戻す
 */
function resetWaitingState() {
    currentChallengeIndex = 0;
    CURRENT_CHALLENGES.length = 0; // チャレンジリストをクリア
    isPoseFixed = false; 
    finalPoseLandmarks = null;
    currentLandmarksSnapshot = null; // ★ 変更点A: スナップショットをクリア
    isChallengeStarted = false;
    isInPreparationPhase = false; 
    isWaitingForStartPose = true; // 待機状態に戻す
    
    currentStartPoseType = 'VERTICAL'; 
    
    matchScoreElement.textContent = '-- %';
    matchScoreElement.style.color = '#4CAF50'; 
    timerDisplayElement.classList.remove('show-timer');
    
    currentChallengeNameElement.textContent = '次のポーズを待機中...';
    guideMessageElement.textContent = 'チャレンジを開始するには、両手を垂直に上げるか、T字ポーズを維持してください。';
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

// ★ 修正点4: スタートポーズの判定ロジックを共通化 (変更なし)
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
 * 起動トリガー用のポーズ (両腕垂直上げ) が取られているか判定する (変更なし)
 */
function isVerticalStartPoseAchieved(landmarks) {
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE.START_TOLERANCE_VERTICAL;
    return isArmPoseAchieved(landmarks, target.SHOULDER, target.ELBOW, tolerance);
}

/**
 * ★ 修正点5: 起動トリガー用のポーズ (T字ポーズ) が取られているか判定する (変更なし)
 */
function isTPoseStartPoseAchieved(landmarks) {
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE.START_TOLERANCE_T_POSE;
    return isArmPoseAchieved(landmarks, target.T_POSE_SHOULDER, target.T_POSE_ELBOW, tolerance);
}

/**
 * マッチングロジック (最終スコア計算) (変更なし)
 */
function calculateMatchScore(currentLandmarks) {
    const challenge = CURRENT_CHALLENGES[currentChallengeIndex];
    const L = LANDMARK_INDICES;
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE;
    let totalScore = 0;
    let jointCount = 0;

    // --- 1. ARMチャレンジ (左手上げ, 右手上げ) の評価 ---
    if (challenge.targetType === 'ARM') {
        const side = challenge.evalJoints[0].includes('L') ? 'LEFT' : 'RIGHT';
        const otherSide = side === 'LEFT' ? 'RIGHT' : 'LEFT'; 
        
        const S = L[`${side}_SHOULDER`];
        const E = L[`${side}_ELBOW`];
        const W = L[`${side}_WRIST`];
        const H = L[`${side}_HIP`];

        const otherS = L[`${otherSide}_SHOULDER`];
        const otherE = L[`${otherSide}_ELBOW`];
        const otherW = L[`${otherSide}_WRIST`];
        const otherH = L[`${otherSide}_HIP`];
        
        const VISIBILITY_THRESHOLD = 0.5; 
        
        const isTargetArmVisible = currentLandmarks[S] && currentLandmarks[E] && 
                                  currentLandmarks[W] && currentLandmarks[H] &&
                                  currentLandmarks[S].visibility > VISIBILITY_THRESHOLD && 
                                  currentLandmarks[E].visibility > VISIBILITY_THRESHOLD &&
                                  currentLandmarks[W].visibility > VISIBILITY_THRESHOLD;


        const isOtherArmVisible = currentLandmarks[otherS] && currentLandmarks[otherE] && 
                                  currentLandmarks[otherW] && currentLandmarks[otherH];

        // ★ 修正点6: ポーズが全く検出されない場合の早期リターンを追加 (スコア0回避のため)
        if (!currentLandmarks[L.LEFT_SHOULDER] || currentLandmarks[L.LEFT_SHOULDER].visibility < 0.1) return 0;

        const currentTargetElbowAngle = calculateAngle(currentLandmarks[S], currentLandmarks[E], currentLandmarks[W]);
        const currentTargetShoulderAngle = calculateAngle(currentLandmarks[H], currentLandmarks[S], currentLandmarks[E]);
        
        const targetTolerance = 5; 

        let isOtherArmUp = false;
        if (isOtherArmVisible) { 
            const otherShoulderAngle = calculateAngle(currentLandmarks[otherH], currentLandmarks[otherS], currentLandmarks[otherE]);
            const otherElbowAngle = calculateAngle(currentLandmarks[otherS], currentLandmarks[otherE], currentLandmarks[otherW]);
            
            isOtherArmUp = (
                Math.abs(otherShoulderAngle - target.SHOULDER) <= targetTolerance &&
                Math.abs(otherElbowAngle - target.ELBOW) <= targetTolerance
            );
        }
        
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
        const poseTolerance = tolerance.L_SHAPE_TOLERANCE; 
        
        // ★ 修正点6: ポーズが全く検出されない場合の早期リターンを追加
        if (!currentLandmarks[L.LEFT_SHOULDER] || currentLandmarks[L.LEFT_SHOULDER].visibility < 0.1) return 0;
        
        for (const side of sides) {
            const S = L[`${side}_SHOULDER`];
            const E = L[`${side}_ELBOW`];
            const W = L[`${side}_WRIST`];
            const H = L[`${side}_HIP`];
            
            const isArmVisible = currentLandmarks[S] && currentLandmarks[E] && 
                                  currentLandmarks[W] && currentLandmarks[H] &&
                                  currentLandmarks[S].visibility > VISIBILITY_THRESHOLD && 
                                  currentLandmarks[E].visibility > VISIBILITY_THRESHOLD &&
                                  currentLandmarks[W].visibility > VISIBILITY_THRESHOLD;

            if (!isArmVisible) {
                return 0; 
            }

            const currentElbowAngle = calculateAngle(currentLandmarks[S], currentLandmarks[E], currentLandmarks[W]);
            const currentShoulderAngle = calculateAngle(currentLandmarks[H], currentLandmarks[S], currentLandmarks[E]);
            
            const diffElbow = Math.abs(currentElbowAngle - targetElbow);
            const diffShoulder = Math.abs(currentShoulderAngle - targetShoulder);
            
            const scoreElbow = 100 * (1 - (diffElbow / poseTolerance));
            const scoreShoulder = 100 * (1 - (diffShoulder / poseTolerance));

            totalScore += Math.max(0, scoreElbow);
            totalScore += Math.max(0, scoreShoulder);
            jointCount += 2;
        }

    }
    
    // ★ 修正点7: jointCountが0の場合は、ポーズが見つからなかったと判断し0を返す
    if (jointCount === 0) return 0;
    
    return Math.min(100, totalScore / jointCount); 
}


// =========================================================================
// ⏱️ チャレンジ管理ロジック
// =========================================================================

/**
 * チャレンジをリセットし、次のステージへ進む (変更なし)
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

    if (currentChallengeIndex < CURRENT_CHALLENGES.length) {
        // 次のチャレンジへ
        const nextChallenge = CURRENT_CHALLENGES[currentChallengeIndex];
        
        currentStartPoseType = nextChallenge.requiredStartPose; // 開始ポーズはここでロックされる
        
        guideMessageElement.textContent = `次のチャレンジ: ${nextChallenge.name} ポーズを確認！そのままでお待ちください...`;
        
        timerDisplayElement.classList.remove('show-timer');
        
        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = `▶️ ${nextChallenge.name}`;
        }
        
        // ★ 修正点8: 連続チャレンジの場合、状態遷移を安定させるため、遅延を入れて準備フェーズを開始
        setTimeout(() => {
            startPreparationPhase(); 
        }, 50); // 50msの短い遅延
        

    } else {
        // 全チャレンジ完了 -> 平均スコアを表示
        showChallengeResults();
    }
}

/**
 * 最終結果を表示する (変更なし)
 */
function showChallengeResults() {
    let totalScore = 0;
    let scoreList = "";
    
    CURRENT_CHALLENGES.forEach((c) => {
        totalScore += c.score;
        scoreList += `${c.name}: ${c.score.toFixed(1)}%\n`;
    });
    
    const isTPoseGroup = CURRENT_CHALLENGES.length > 1; 
    const averageScore = totalScore / CURRENT_CHALLENGES.length;

    let messageHTML;
    
    if (isTPoseGroup) {
        // T字ポーズグループの平均スコア表示
        if (averageScore > 85) {
            matchScoreElement.style.color = '#4CAF50';
            messageHTML = `🎉 **連続チャレンジ完了！** 平均スコア: ${averageScore.toFixed(1)}%<br>素晴らしいパーフェクト達成です！`;
        } else {
            matchScoreElement.style.color = '#FFC107';
            messageHTML = `**連続チャレンジ完了！** 平均スコア: ${averageScore.toFixed(1)}%<br>結果をコンソールで確認し、もう一度チャレンジしましょう！`;
        }
        matchScoreElement.textContent = averageScore.toFixed(1) + ' % (平均)';
    } else {
        // 垂直ポーズ（チュートリアル）の結果表示
        if (averageScore > 90) {
            matchScoreElement.style.color = '#4CAF50';
            messageHTML = `🌟 **${CURRENT_CHALLENGES[0].name} 完了！** 素晴らしいです！`;
        } else {
            matchScoreElement.style.color = '#FFC107';
            messageHTML = `**${CURRENT_CHALLENGES[0].name} 完了！** もう一度チャレンジしましょう！`;
        }
        matchScoreElement.textContent = averageScore.toFixed(1) + ' % (FINAL)';
    }

    guideMessageElement.innerHTML = messageHTML;

    console.log("--- CHALLENGE RESULTS ---");
    console.log(scoreList);
    console.log(`Average Score: ${averageScore.toFixed(1)}%`);
    console.log("------------------------------");
    
    // 結果表示後、数秒待って待機状態に戻す
    setTimeout(resetWaitingState, 3000); 
}

/**
 * 準備フェーズを開始する (変更なし)
 */
function startPreparationPhase() {
    if (isChallengeStarted || isInPreparationPhase) return;
    isInPreparationPhase = true;
    isWaitingForStartPose = false; // 待機状態を解除

    const currentChallenge = CURRENT_CHALLENGES[currentChallengeIndex];
    guideMessageElement.textContent = `✅ ${currentChallenge.message.replace(/【.+】/, '')} ポーズを確認！そのままでお待ちください...`;
    
    setTimeout(() => {
        isInPreparationPhase = false;
        startChallengeTimer();
    }, PREP_DELAY_SECONDS * 1000);
}

// チャレンジ強制開始関数
function forceStartChallenge() {
    if (isChallengeStarted || isInPreparationPhase) {
        console.warn("チャレンジは既に進行中です。");
        return;
    }
    
    // T_POSEグループからランダムにチャレンジを選択して実行
    const selected = [...T_POSE_CHALLENGES];
    // 実行順をシャッフル
    for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selected[i], selected[j]] = [selected[j], selected[i]];
    }
    
    CURRENT_CHALLENGES.length = 0;
    selected.forEach(c => CURRENT_CHALLENGES.push({ ...c, score: null }));
    currentStartPoseType = 'T_POSE'; 
    currentChallengeIndex = 0; // ★ 修正点: 常に0にセット
    
    isInPreparationPhase = false; 
    startChallengeTimer();
    console.log(`デバッグモード: チャレンジ ${CURRENT_CHALLENGES.map(c => c.name).join(', ')} を強制開始しました。`);
}


/**
 * カウントダウンタイマーを開始する 
 * ★ 変更点B: タイマー終了時にポーズを確定させ、スコアを記録する
 */
function startChallengeTimer() {
    if (isChallengeStarted) return;
    isChallengeStarted = true;

    timerDisplayElement.classList.add('show-timer');
    
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
            // ★ 変更点B: タイマー終了! スコアを確定させるロジックをここに移動
            clearInterval(challengeTimerId);
            
            // finalPoseLandmarksの代わりに currentLandmarksSnapshot を使用
            if (currentLandmarksSnapshot) {
                const score = calculateMatchScore(currentLandmarksSnapshot);
                CURRENT_CHALLENGES[currentChallengeIndex].score = score;
                
                // 表示を更新
                matchScoreElement.textContent = score.toFixed(1) + ' % (FINAL)';
                isPoseFixed = true; // 描画ロジックのために true にセット
                finalPoseLandmarks = currentLandmarksSnapshot; // 描画ロジックのためにスナップショットをセット
                
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
            } else {
                // スナップショットが取得できなかった場合 (カメラエラーや人が写っていない)
                CURRENT_CHALLENGES[currentChallengeIndex].score = 0;
                matchScoreElement.textContent = '0.0 % (FINAL)';
                matchScoreElement.style.color = '#F44336';
                guideMessageElement.textContent = `${CURRENT_CHALLENGES[currentChallengeIndex].name} 完了。ポーズが検出できませんでした。`;
                isPoseFixed = true; 
            }
            
            timerDisplayElement.classList.remove('show-timer');
            
             if (currentChallengeNameElement) {
                 currentChallengeNameElement.textContent = `✅ ${CURRENT_CHALLENGES[currentChallengeIndex].name}`;
             }

            // スコア確定後、次のチャレンジへ移行
            setTimeout(() => {
                resetChallenge(true);
            }, 1000); 
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
    resetWaitingState(); 
    
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
 * ★ 変更点C: リアルタイムスコア計算用スナップショットの更新と、ポーズ固定ロジックの削除
 */
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalCompositeOperation = 'source_over';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        
        // --- 1. チャレンジ開始トリガー判定 ---
        if (isWaitingForStartPose && !isChallengeStarted && !isInPreparationPhase) {
            let isVerticalReady = isVerticalStartPoseAchieved(results.poseLandmarks);
            let isTPoseReady = isTPoseStartPoseAchieved(results.poseLandmarks);

            if (isVerticalReady || isTPoseReady) {
                
                // チャレンジリストを決定
                CURRENT_CHALLENGES.length = 0;
                
                if (isVerticalReady) {
                    // 垂直ポーズ: 左手上げのみをチュートリアルとして実行
                    CURRENT_CHALLENGES.push({ ...VERTICAL_CHALLENGES[0], score: null });
                    currentStartPoseType = 'VERTICAL';
                    currentChallengeNameElement.textContent = `▶️ ${VERTICAL_CHALLENGES[0].name} 準備中...`;
                    
                } else if (isTPoseReady) {
                    // T字ポーズ: 2つのチャレンジをランダムに実行
                    const selected = [...T_POSE_CHALLENGES];
                    // 実行順をシャッフル
                    for (let i = selected.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [selected[i], selected[j]] = [selected[j], selected[i]];
                    }
                    
                    selected.forEach(c => CURRENT_CHALLENGES.push({ ...c, score: null }));
                    currentStartPoseType = 'T_POSE';
                    currentChallengeNameElement.textContent = `▶️ 連続チャレンジ 準備中...`;
                }
                
                // チャレンジリストが確定したら、準備フェーズを開始
                if (CURRENT_CHALLENGES.length > 0) {
                    currentChallengeIndex = 0;
                    startPreparationPhase();
                }
            }
        }
        
        // ★ 変更点C: リアルタイムポーズスナップショットを更新
        if (isChallengeStarted && !isPoseFixed) {
            currentLandmarksSnapshot = JSON.parse(JSON.stringify(results.poseLandmarks));
        }

        // --- 2. 描画とスコア表示の更新 ---
        const drawingLandmarksToUse = finalPoseLandmarks || results.poseLandmarks;

        const lineColor = isPoseFixed ? '#FFD700' : '#00FF00'; // isPoseFixed を使用
        const dotColor = isPoseFixed ? '#FFA500' : '#FF0000'; // isPoseFixed を使用
        
        drawConnectors(canvasCtx, drawingLandmarksToUse, window.POSE_CONNECTIONS,
                       { color: lineColor, lineWidth: 4 }); 
        drawLandmarks(canvasCtx, drawingLandmarksToUse,
                      { color: dotColor, lineWidth: 2, radius: 4 });

        if (!isPoseFixed && isChallengeStarted && currentLandmarksSnapshot) { // isPoseFixed とスナップショットをチェック
             const score = calculateMatchScore(currentLandmarksSnapshot);
             matchScoreElement.textContent = score.toFixed(1) + ' %';
             
             if (score > 80) {
                matchScoreElement.style.color = '#4CAF50';
             } else if (score > 50) {
                matchScoreElement.style.color = '#FFA500';
             } else {
                matchScoreElement.style.color = '#F44336';
             }
        } else if (!isChallengeStarted && !isWaitingForStartPose) {
             // チャレンジが終了して待機状態に戻るまでの描画ロジック
             if (finalPoseLandmarks) {
                 // 確定したポーズを表示し続ける
                 drawConnectors(canvasCtx, finalPoseLandmarks, window.POSE_CONNECTIONS, { color: '#FFD700', lineWidth: 4 });
                 drawLandmarks(canvasCtx, finalPoseLandmarks, { color: '#FFA500', lineWidth: 2, radius: 4 });
             }
        }
    }
    
    canvasCtx.restore();
}