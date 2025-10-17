// 必要な定数を challenges.js からインポート
import {
    ALL_CHALLENGES,
    CURRENT_CHALLENGES, 
    VERTICAL_CHALLENGES, 
    T_POSE_CHALLENGES, 
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
const overlayImageElement = document.getElementById('challenge-pose-overlay'); 

canvasElement.width = 640;
canvasElement.height = 480;

// 状態管理のための変数
let currentLandmarksSnapshot = null; 
let currentChallengeIndex = 0;
let isPoseFixed = false; 
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
// チャレンジの初期化とロジック
// -------------------------------------------------------------------------

/**
 * チャレンジリストをクリアし、初期待機状態に戻す
 */
function resetWaitingState() {
    currentChallengeIndex = 0;
    CURRENT_CHALLENGES.length = 0; 
    isPoseFixed = false; 
    finalPoseLandmarks = null;
    currentLandmarksSnapshot = null; 
    isChallengeStarted = false;
    isInPreparationPhase = false; 
    isWaitingForStartPose = true; 
    
    currentStartPoseType = 'VERTICAL'; 
    
    matchScoreElement.textContent = '-- %';
    matchScoreElement.style.color = '#4CAF50'; 
    timerDisplayElement.classList.remove('show-timer');
    
    currentChallengeNameElement.textContent = '次のポーズを待機中...';
    guideMessageElement.textContent = 'チャレンジを開始するには、両手を垂直に上げるか、T字ポーズを維持してください。';
    
    // 画像オーバーレイを非表示
    if (overlayImageElement) {
        overlayImageElement.style.display = 'none';
        overlayImageElement.src = '';
    }
}


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
 * 2つのランドマークを結ぶ線の垂直からの傾き角度を計算 
 * @param {object} L1 - ランドマーク1 (例: HIP)
 * @param {object} L2 - ランドマーク2 (例: SHOULDER)
 * @returns {number} 垂直からの傾き角度 (0-90度)
 */
function calculateVerticalTiltAngle(L1, L2) {
    // ランドマークが利用可能でなければ0を返す
    if (!L1 || !L2) return 0; 

    // Y軸の差分 (垂直方向)
    const dy = L2.y - L1.y;
    // X軸の差分 (水平方向)
    const dx = L2.x - L1.x;

    let angleRad = Math.atan2(Math.abs(dx), Math.abs(dy));
    let angleDeg = angleRad * (180 / Math.PI);

    return angleDeg;
}

/**
 * 2つのランドマーク間の距離を計算（正規化座標）
 * @param {object} L1 - ランドマーク1
 * @param {object} L2 - ランドmark2
 * @returns {object} {distanceX, distanceY, totalDistance} 距離
 */
function calculateDistance(L1, L2) {
    if (!L1 || !L2) return { distanceX: 0, distanceY: 0, totalDistance: 0 };
    const dx = L1.x - L2.x;
    const dy = L1.y - L2.y;
    return {
        distanceX: Math.abs(dx),
        distanceY: Math.abs(dy),
        totalDistance: Math.sqrt(dx * dx + dy * dy)
    };
}


// スタートポーズの判定ロジック
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

function isVerticalStartPoseAchieved(landmarks) {
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE.START_TOLERANCE_VERTICAL;
    return isArmPoseAchieved(landmarks, target.SHOULDER, target.ELBOW, tolerance);
}

function isTPoseStartPoseAchieved(landmarks) {
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE.START_TOLERANCE_T_POSE;
    return isArmPoseAchieved(landmarks, target.T_POSE_SHOULDER, target.T_POSE_ELBOW, tolerance);
}

/**
 * スコアを計算する汎用ヘルパー関数
 * @param {number} currentAngle - 現在の関節角度
 * @param {number} targetAngle - 目標とする関節角度
 * @param {number} tolerance - 許容誤差 (この値を超えるとスコア0)
 * @returns {number} 0から100のスコア
 */
function calculateScore(currentAngle, targetAngle, tolerance) {
    const diff = Math.abs(currentAngle - targetAngle);
    // 許容誤差をベースに正規化
    const score = 100 * (1 - (diff / tolerance));
    return Math.max(0, score);
}

/**
 * マッチングロジック (最終スコア計算)
 */
function calculateMatchScore(currentLandmarks) {
    const challenge = CURRENT_CHALLENGES[currentChallengeIndex];
    const L = LANDMARK_INDICES;
    const target = TARGET_ANGLES;
    const tolerance = TOLERANCE;
    let totalScore = 0;
    let jointCount = 0;
    const VISIBILITY_THRESHOLD = 0.5; 
    const GRIP_VISIBILITY_THRESHOLD = 0.3; 
    
    // 早期リターンチェック: ポーズが全く検出されない場合
    if (!currentLandmarks[L.LEFT_SHOULDER] || currentLandmarks[L.LEFT_SHOULDER].visibility < 0.1) return 0;


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
        
        const isTargetArmVisible = currentLandmarks[S] && currentLandmarks[E] && 
                                  currentLandmarks[W] && currentLandmarks[H] &&
                                  currentLandmarks[S].visibility > VISIBILITY_THRESHOLD && 
                                  currentLandmarks[E].visibility > VISIBILITY_THRESHOLD &&
                                  currentLandmarks[W].visibility > VISIBILITY_THRESHOLD;


        const isOtherArmVisible = currentLandmarks[otherS] && currentLandmarks[otherE] && 
                                  currentLandmarks[otherW] && currentLandmarks[otherH];

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
        const targetShoulder = target.L_SHAPE_SHOULDER; // 90度
        const targetElbow = target.L_SHAPE_ELBOW;       // 90度
        const poseTolerance = tolerance.L_SHAPE_TOLERANCE; 
        
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
    
    // 5. SINGLE_SWORD_POSE (片手剣ポーズ - 右腕のみ判定) の評価ロジック
    else if (challenge.targetType === 'SINGLE_SWORD_POSE') {
        const S_R = L.RIGHT_SHOULDER, E_R = L.RIGHT_ELBOW, W_R = L.RIGHT_WRIST, H_R = L.RIGHT_HIP;
        const T = target;
        const SWORD_TOL = tolerance.SWORD_TOLERANCE;

        // 必須ランドマークの可視性チェック (右腕に必要なもの)
        if (!currentLandmarks[S_R] || !currentLandmarks[E_R] || !currentLandmarks[W_R] ||
            !currentLandmarks[H_R] || currentLandmarks[S_R].visibility < VISIBILITY_THRESHOLD) {
            return 0;
        }

        // --- 5-A. ターゲット腕（右腕）の評価 ---
        
        // 右肩の角度 (右腰-右肩-右肘)
        const currentRightShoulderAngle = calculateAngle(currentLandmarks[H_R], currentLandmarks[S_R], currentLandmarks[E_R]);
        totalScore += calculateScore(currentRightShoulderAngle, T.SWORD_SHOULDER, SWORD_TOL);
        jointCount++;

        // 右肘の角度 (右肩-右肘-右手首)
        const currentRightElbowAngle = calculateAngle(currentLandmarks[S_R], currentLandmarks[E_R], currentLandmarks[W_R]);
        totalScore += calculateScore(currentRightElbowAngle, T.SWORD_ELBOW, SWORD_TOL);
        jointCount++;
        
        // 左腕の判定ロジックは削除済み
    }
    
    // 6. SWORD_GRIP (両腕の剣握りポーズ - 両肩と両肘のみ) の評価ロジック
    else if (challenge.targetType === 'SWORD_GRIP') {
        const sides = ['LEFT', 'RIGHT'];
        const T = target;
        const GRIP_TOL = tolerance.GRIP_TOLERANCE;
        
        for (const side of sides) {
            const S = L[`${side}_SHOULDER`];
            const E = L[`${side}_ELBOW`];
            const H = L[`${side}_HIP`];
            const W = L[`${side}_WRIST`];
            
            // 必須ランドマークの可視性チェック (可視性閾値 0.3 を使用)
            if (!currentLandmarks[S] || !currentLandmarks[E] || !currentLandmarks[H] || !currentLandmarks[W] ||
                currentLandmarks[S].visibility < GRIP_VISIBILITY_THRESHOLD ||
                currentLandmarks[E].visibility < GRIP_VISIBILITY_THRESHOLD ||
                currentLandmarks[H].visibility < GRIP_VISIBILITY_THRESHOLD ||
                currentLandmarks[W].visibility < GRIP_VISIBILITY_THRESHOLD) { 
                return 0; 
            }
            
            // 肩の角度 (腰-肩-肘)
            const currentShoulderAngle = calculateAngle(currentLandmarks[H], currentLandmarks[S], currentLandmarks[E]);
            totalScore += calculateScore(currentShoulderAngle, T.GRIP_SHOULDER, GRIP_TOL);
            jointCount++;

            // 肘の角度 (肩-肘-手首)
            const currentElbowAngle = calculateAngle(currentLandmarks[S], currentLandmarks[E], currentLandmarks[W]);
            totalScore += calculateScore(currentElbowAngle, T.GRIP_ELBOW, GRIP_TOL);
            jointCount++;
        }
    }

    // 7. SIDE_BEND_ARMS (頭上での屈曲ポーズ) の評価ロジック
    else if (challenge.targetType === 'SIDE_BEND_ARMS') {
        const T = target;
        const BEND_TOL = tolerance.SIDE_BEND_TOLERANCE; 

        // 右腕の判定 (より鋭角な曲げ)
        const R_S = L.RIGHT_SHOULDER, R_E = L.RIGHT_ELBOW, R_H = L.RIGHT_HIP, R_W = L.RIGHT_WRIST;
        
        // 必須ランドマークの可視性チェックの強化
        if (currentLandmarks[R_S] && currentLandmarks[R_E] && currentLandmarks[R_H] && currentLandmarks[R_W] &&
            currentLandmarks[R_S].visibility > GRIP_VISIBILITY_THRESHOLD && 
            currentLandmarks[R_E].visibility > GRIP_VISIBILITY_THRESHOLD &&
            currentLandmarks[R_W].visibility > GRIP_VISIBILITY_THRESHOLD) {
            
            const rightShoulderAngle = calculateAngle(currentLandmarks[R_H], currentLandmarks[R_S], currentLandmarks[R_E]);
            const rightElbowAngle = calculateAngle(currentLandmarks[R_S], currentLandmarks[R_E], currentLandmarks[R_W]);
            
            totalScore += calculateScore(rightShoulderAngle, T.SIDE_BEND_SHOULDER, BEND_TOL);
            totalScore += calculateScore(rightElbowAngle, T.SIDE_BEND_R_ELBOW, BEND_TOL);
            jointCount += 2;
        } else {
            return 0; 
        }

        // 左腕の判定 (やや緩やかな曲げ)
        const L_S = L.LEFT_SHOULDER, L_E = L.LEFT_ELBOW, L_H = L.LEFT_HIP, L_W = L.LEFT_WRIST;
        
        // 必須ランドマークの可視性チェックの強化
        if (currentLandmarks[L_S] && currentLandmarks[L_E] && currentLandmarks[L_H] && currentLandmarks[L_W] &&
            currentLandmarks[L_S].visibility > GRIP_VISIBILITY_THRESHOLD &&
            currentLandmarks[L_E].visibility > GRIP_VISIBILITY_THRESHOLD &&
            currentLandmarks[L_W].visibility > GRIP_VISIBILITY_THRESHOLD) {
            
            const leftShoulderAngle = calculateAngle(currentLandmarks[L_H], currentLandmarks[L_S], currentLandmarks[L_E]);
            const leftElbowAngle = calculateAngle(currentLandmarks[L_S], currentLandmarks[L_E], currentLandmarks[L_W]);
            
            totalScore += calculateScore(leftShoulderAngle, T.SIDE_BEND_SHOULDER, BEND_TOL);
            totalScore += calculateScore(leftElbowAngle, T.SIDE_BEND_L_ELBOW, BEND_TOL);
            jointCount += 2;
        } else {
            return 0; 
        }
    }
    
    // 8. ASYM_ARCHERY_ARMS (非対称の弓引きポーズ) の評価ロジック
    else if (challenge.targetType === 'ASYM_ARCHERY_ARMS') {
        const T = target;
        const ARCH_TOL = tolerance.ARCHERY_TOLERANCE; 
        const ARCH_VISIBILITY_THRESHOLD = GRIP_VISIBILITY_THRESHOLD; 
        
        let isLeftArmVisible = currentLandmarks[L.LEFT_SHOULDER] && currentLandmarks[L.LEFT_ELBOW] && currentLandmarks[L.LEFT_WRIST] && currentLandmarks[L.LEFT_HIP] &&
                                currentLandmarks[L.LEFT_SHOULDER].visibility > ARCH_VISIBILITY_THRESHOLD &&
                                currentLandmarks[L.LEFT_ELBOW].visibility > ARCH_VISIBILITY_THRESHOLD &&
                                currentLandmarks[L.LEFT_WRIST].visibility > ARCH_VISIBILITY_THRESHOLD;

        let isRightArmVisible = currentLandmarks[L.RIGHT_SHOULDER] && currentLandmarks[L.RIGHT_ELBOW] && currentLandmarks[L.RIGHT_WRIST] && currentLandmarks[L.RIGHT_HIP] &&
                                currentLandmarks[L.RIGHT_SHOULDER].visibility > ARCH_VISIBILITY_THRESHOLD &&
                                currentLandmarks[L.RIGHT_ELBOW].visibility > ARCH_VISIBILITY_THRESHOLD &&
                                currentLandmarks[L.RIGHT_WRIST].visibility > ARCH_VISIBILITY_THRESHOLD;
        
        if (!isLeftArmVisible || !isRightArmVisible) {
            return 0;
        }
        
        // --- 右腕 (曲げている側) の判定 ---
        const rightShoulderAngle = calculateAngle(currentLandmarks[L.RIGHT_HIP], currentLandmarks[L.RIGHT_SHOULDER], currentLandmarks[L.RIGHT_ELBOW]);
        const rightElbowAngle = calculateAngle(currentLandmarks[L.RIGHT_SHOULDER], currentLandmarks[L.RIGHT_ELBOW], currentLandmarks[L.RIGHT_WRIST]);
        
        totalScore += calculateScore(rightShoulderAngle, T.ARCHERY_R_SHOULDER, ARCH_TOL);
        totalScore += calculateScore(rightElbowAngle, T.ARCHERY_R_ELBOW, ARCH_TOL);
        jointCount += 2;

        // --- 左腕 (伸ばしている側) の判定 ---
        const leftShoulderAngle = calculateAngle(currentLandmarks[L.LEFT_HIP], currentLandmarks[L.LEFT_SHOULDER], currentLandmarks[L.LEFT_ELBOW]);
        const leftElbowAngle = calculateAngle(currentLandmarks[L.LEFT_SHOULDER], currentLandmarks[L.LEFT_ELBOW], currentLandmarks[L.LEFT_WRIST]);
        
        totalScore += calculateScore(leftShoulderAngle, T.ARCHERY_L_SHOULDER, ARCH_TOL);
        totalScore += calculateScore(leftElbowAngle, T.ARCHERY_L_ELBOW, ARCH_TOL);
        jointCount += 2;
    }

    // ★ 9. ASYM_SALUTE_ARMS (敬礼ポーズ) の評価ロジック
    else if (challenge.targetType === 'ASYM_SALUTE_ARMS') {
        const T = target;
        const SALUTE_TOL = tolerance.SALUTE_TOLERANCE; // 30 を使用
        const SALUTE_VISIBILITY_THRESHOLD = VISIBILITY_THRESHOLD; // 0.5 を使用
        
        let isLeftArmVisible = currentLandmarks[L.LEFT_SHOULDER] && currentLandmarks[L.LEFT_ELBOW] && currentLandmarks[L.LEFT_WRIST] && currentLandmarks[L.LEFT_HIP] &&
                                currentLandmarks[L.LEFT_SHOULDER].visibility > SALUTE_VISIBILITY_THRESHOLD &&
                                currentLandmarks[L.LEFT_ELBOW].visibility > SALUTE_VISIBILITY_THRESHOLD &&
                                currentLandmarks[L.LEFT_WRIST].visibility > SALUTE_VISIBILITY_THRESHOLD;

        let isRightArmVisible = currentLandmarks[L.RIGHT_SHOULDER] && currentLandmarks[L.RIGHT_ELBOW] && currentLandmarks[L.RIGHT_WRIST] && currentLandmarks[L.RIGHT_HIP] &&
                                currentLandmarks[L.RIGHT_SHOULDER].visibility > SALUTE_VISIBILITY_THRESHOLD &&
                                currentLandmarks[L.RIGHT_ELBOW].visibility > SALUTE_VISIBILITY_THRESHOLD &&
                                currentLandmarks[L.RIGHT_WRIST].visibility > SALUTE_VISIBILITY_THRESHOLD;
        
        if (!isLeftArmVisible || !isRightArmVisible) {
            return 0;
        }

        // --- 右腕 (敬礼側) の判定 ---
        const rightShoulderAngle = calculateAngle(currentLandmarks[L.RIGHT_HIP], currentLandmarks[L.RIGHT_SHOULDER], currentLandmarks[L.RIGHT_ELBOW]);
        const rightElbowAngle = calculateAngle(currentLandmarks[L.RIGHT_SHOULDER], currentLandmarks[L.RIGHT_ELBOW], currentLandmarks[L.RIGHT_WRIST]);
        
        totalScore += calculateScore(rightShoulderAngle, T.SALUTE_R_SHOULDER, SALUTE_TOL);
        totalScore += calculateScore(rightElbowAngle, T.SALUTE_R_ELBOW, SALUTE_TOL);
        jointCount += 2;

        // --- 左腕 (下げている側) の判定 ---
        const leftShoulderAngle = calculateAngle(currentLandmarks[L.LEFT_HIP], currentLandmarks[L.LEFT_SHOULDER], currentLandmarks[L.LEFT_ELBOW]);
        const leftElbowAngle = calculateAngle(currentLandmarks[L.LEFT_SHOULDER], currentLandmarks[L.LEFT_ELBOW], currentLandmarks[L.LEFT_WRIST]);
        
        totalScore += calculateScore(leftShoulderAngle, T.SALUTE_L_SHOULDER, SALUTE_TOL);
        totalScore += calculateScore(leftElbowAngle, T.SALUTE_L_ELBOW, SALUTE_TOL);
        jointCount += 2;
    }
    
    // ★ 10. SURPRISE_ARMS (びっくりした人ポーズ) の評価ロジック (追加)
    else if (challenge.targetType === 'SURPRISE_ARMS') {
        const sides = ['LEFT', 'RIGHT'];
        const T = target;
        const SURPRISE_TOL = tolerance.SURPRISE_TOLERANCE; // 40度を使用
        const SURPRISE_VISIBILITY_THRESHOLD = VISIBILITY_THRESHOLD; // 0.5 を使用
        
        for (const side of sides) {
            const S = L[`${side}_SHOULDER`];
            const E = L[`${side}_ELBOW`];
            const H = L[`${side}_HIP`];
            const W = L[`${side}_WRIST`]; // 手首もチェック
            
            // 必須ランドマークの可視性チェック
            if (!currentLandmarks[S] || !currentLandmarks[E] || !currentLandmarks[H] || !currentLandmarks[W] ||
                currentLandmarks[S].visibility < SURPRISE_VISIBILITY_THRESHOLD ||
                currentLandmarks[E].visibility < SURPRISE_VISIBILITY_THRESHOLD ||
                currentLandmarks[W].visibility < SURPRISE_VISIBILITY_THRESHOLD) { 
                return 0; 
            }
            
            // 肩の角度 (腰-肩-肘)
            const currentShoulderAngle = calculateAngle(currentLandmarks[H], currentLandmarks[S], currentLandmarks[E]);
            totalScore += calculateScore(currentShoulderAngle, T.SURPRISE_SHOULDER, SURPRISE_TOL);
            jointCount++;

            // 肘の角度 (肩-肘-手首)
            const currentElbowAngle = calculateAngle(currentLandmarks[S], currentLandmarks[E], currentLandmarks[W]);
            totalScore += calculateScore(currentElbowAngle, T.SURPRISE_ELBOW, SURPRISE_TOL);
            jointCount++;
        }
    }
    
    // jointCountが0の場合にNaNを返すのを防ぐ
    if (jointCount === 0) return 0;
    
    // ゼロ除算のチェックが通過したため、安全に計算
    const finalScore = totalScore / jointCount;
    
    if (isNaN(finalScore)) return 0;
    
    return Math.min(100, finalScore); 
}


// =========================================================================
// ⏱️ チャレンジ管理ロジック (変更なし)
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

    if (currentChallengeIndex < CURRENT_CHALLENGES.length) {
        // 次のチャレンジへ
        const nextChallenge = CURRENT_CHALLENGES[currentChallengeIndex];
        
        currentStartPoseType = nextChallenge.requiredStartPose; 
        
        guideMessageElement.textContent = `次のチャレンジ: ${nextChallenge.name} ポーズを確認！そのままでお待ちください...`;
        
        timerDisplayElement.classList.remove('show-timer');
        
        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = `▶️ ${nextChallenge.name}`;
        }
        
        // チャレンジ画像が定義されていれば表示
        if (overlayImageElement && nextChallenge.imageSrc) {
            overlayImageElement.src = nextChallenge.imageSrc;
            overlayImageElement.style.display = 'block';
        } else if (overlayImageElement) {
             overlayImageElement.style.display = 'none';
        }
        
        setTimeout(() => {
            startPreparationPhase(); 
        }, 50); 
        

    } else {
        // 全チャレンジ完了 -> 平均スコアを表示
        showChallengeResults();
        
        // 最終結果表示時にオーバーレイを非表示に
        if (overlayImageElement) {
            overlayImageElement.style.display = 'none';
        }
    }
}

/**
 * 最終結果を表示する
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
 * 準備フェーズを開始する
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
    
    const selected = [...T_POSE_CHALLENGES]; 
    // 実行順をシャッフル
    for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selected[i], selected[j]] = [selected[j], selected[i]];
    }
    
    CURRENT_CHALLENGES.length = 0;
    selected.forEach(c => CURRENT_CHALLENGES.push({ ...c, score: null }));
    currentStartPoseType = 'T_POSE'; 
    currentChallengeIndex = 0; 
    
    isInPreparationPhase = false; 
    startChallengeTimer();
    console.log(`デバッグモード: チャレンジ ${CURRENT_CHALLENGES.map(c => c.name).join(', ')} を強制開始しました。`);
}


/**
 * カウントダウンタイマーを開始する
 */
/**
 * カウントダウンタイマーを開始する
 */
function startChallengeTimer() {
    if (isChallengeStarted) return;
    isChallengeStarted = true;

    // 状態変数をクリアし、リフレッシュ
    isPoseFixed = false;
    finalPoseLandmarks = null;
    currentLandmarksSnapshot = null; 

    timerDisplayElement.classList.add('show-timer');
    
    const currentChallenge = CURRENT_CHALLENGES[currentChallengeIndex];
    // 【T字スタート】などの開始条件表記を削除
    const baseMessage = currentChallenge.message.replace(/【.+】/, ''); 
    
    if (currentChallengeNameElement) {
        currentChallengeNameElement.textContent = `▶️ ${currentChallenge.name}`;
    }

    let intervalCount = 0; 

    // 最初の表示を「3」にするため、最初に表示をセット
    timerDisplayElement.textContent = COUNTDOWN_SECONDS; 
    // ポーズの詳細メッセージを表示
    guideMessageElement.textContent = `${baseMessage} | 準備: ${COUNTDOWN_SECONDS} 秒`;

    challengeTimerId = setInterval(() => {
        intervalCount++;
        const elapsed = intervalCount; 

        if (currentChallengeNameElement) {
            currentChallengeNameElement.textContent = `▶️ ${currentChallenge.name}`;
        }
        
        // カウントダウンフェーズ
        if (elapsed < COUNTDOWN_SECONDS) {
            const remaining = COUNTDOWN_SECONDS - elapsed;
            timerDisplayElement.textContent = remaining;
            // ポーズの詳細メッセージを維持
            guideMessageElement.textContent = `${baseMessage} | 準備: ${remaining} 秒`;
        } 
        // GO! フェーズ（計測開始）
        else if (elapsed === COUNTDOWN_SECONDS) {
             timerDisplayElement.textContent = 'GO!';
             // ポーズの詳細メッセージを維持し、測定中であることを示す
             guideMessageElement.textContent = `${baseMessage} | 測定中: 1 / ${HOLD_SECONDS} 秒`;
        }
        // ホールドフェーズ
        else if (elapsed < TOTAL_DELAY_SECONDS) {
            const holdTime = elapsed - COUNTDOWN_SECONDS;
            timerDisplayElement.textContent = 'GO!'; // GO! を維持
            // ポーズの詳細メッセージを維持
            guideMessageElement.textContent = `${baseMessage} | 測定中: ${holdTime + 1} / ${HOLD_SECONDS} 秒`;
        } 
        // 終了
        else {
            // タイマー終了! スコアを確定させるロジック
            clearInterval(challengeTimerId);
            
            // finalPoseLandmarksの代わりに currentLandmarksSnapshot を使用してスコアを計算
            if (currentLandmarksSnapshot) {
                const score = calculateMatchScore(currentLandmarksSnapshot);
                CURRENT_CHALLENGES[currentChallengeIndex].score = score;
                
                // 表示を更新 (onResultsのスコア更新が止まるように状態をセット)
                matchScoreElement.textContent = score.toFixed(1) + ' % (FINAL)';
                isPoseFixed = true; 
                finalPoseLandmarks = currentLandmarksSnapshot; 
                
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

            // ★ 修正点: スコア確定直後、isChallengeStarted を false にリセットする
            isChallengeStarted = false; 
            
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
    // ★ 修正点: エラーメッセージをより明確にカメラ許可の必要性に言及するように変更
    guideMessageElement.textContent = `🚨 **エラー: カメラの起動に失敗しました。** ブラウザでカメラのアクセスを許可しているか確認してください。 (${error.name})`;
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
                    // T字ポーズ: ランダムにチャレンジを生成
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
        
        // リアルタイムポーズスナップショットを更新
        if (isChallengeStarted && !isPoseFixed) {
            // スコア計算のために、検出されたポーズをスナップショットに保存
            currentLandmarksSnapshot = JSON.parse(JSON.stringify(results.poseLandmarks));
        }


        // --- 2. 描画とスコア表示の更新 ---
        const drawingLandmarksToUse = finalPoseLandmarks || results.poseLandmarks;

        const lineColor = isPoseFixed ? '#FFD700' : '#00FF00'; 
        const dotColor = isPoseFixed ? '#FFA500' : '#FF0000'; 
        
        drawConnectors(canvasCtx, drawingLandmarksToUse, window.POSE_CONNECTIONS,
                       { color: lineColor, lineWidth: 4 }); 
        drawLandmarks(canvasCtx, drawingLandmarksToUse,
                      { color: dotColor, lineWidth: 2, radius: 4 });

        // スコア更新ロジック: チャレンジ中かつスコアが確定していない場合
        if (!isPoseFixed && isChallengeStarted && currentLandmarksSnapshot) { 
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
             // チャレンジが終了して待機状態に戻るまでの描画ロジック (finalPoseLandmarksがセットされているはず)
             if (finalPoseLandmarks) {
                 drawConnectors(canvasCtx, finalPoseLandmarks, window.POSE_CONNECTIONS, { color: '#FFD700', lineWidth: 4 });
                 drawLandmarks(canvasCtx, finalPoseLandmarks, { color: '#FFA500', lineWidth: 2, radius: 4 });
             }
        }
    }
    
    canvasCtx.restore();
}