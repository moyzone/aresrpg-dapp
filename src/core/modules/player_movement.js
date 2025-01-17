// @ts-ignore
import { setInterval } from 'timers/promises'

import { aiter } from 'iterator-helper'
import { Object3D, Vector2, Vector3 } from 'three'
import { lerp } from 'three/src/math/MathUtils.js'
import { WorldGenerator } from '@aresrpg/aresrpg-world'

import { GRAVITY, context, current_character } from '../game/game.js'
import { abortable } from '../utils/iterator.js'
import { compute_animation_state } from '../animations/animation.js'

import { play_step_sound } from './game_audio.js'

const SPEED = 10
const WALK_SPEED = 6
const JUMP_FORCE = 10
const ASCENT_GRAVITY_FACTOR = 3
const APEX_GRAVITY_FACTOR = 0.3
const DESCENT_GRAVITY_FACTOR = 5
const JUMP_FORWARD_IMPULSE = 3
const JUMP_COOLDWON = 0.1 // one jump every 100ms

const jump_states = {
  ASCENT: 'ASCENT',
  APEX: 'APEX',
  DESCENT: 'DESCENT',
  NONE: 'NONE',
}

/** @type {Type.Module} */
export default function () {
  const velocity = new Vector3()

  let jump_state = jump_states.NONE
  let jump_cooldown = 0
  let on_ground = false
  let is_dancing = false
  let is_walking = false
  let chunks_loaded = false

  let last_dance = 0

  const dummy = new Object3D()

  return {
    tick(state, { camera }, delta) {
      const player = state.characters.find(
        character => character.id === state.selected_character_id,
      )
      if (!player) return

      const { inputs } = state
      const origin = player.position.clone()

      const camera_forward = new Vector3(0, 0, -1)
        .applyQuaternion(camera.quaternion)
        .setY(0)
        .normalize()
      const camera_right = new Vector3(1, 0, 0)
        .applyQuaternion(camera.quaternion)
        .setY(0)
        .normalize()

      if (player.target_position) {
        const { x, z } = player.target_position
        const ground_pos = new Vector2(Math.floor(x), Math.floor(z)) // .subScalar(0.5)
        const raw_height = WorldGenerator.instance.getRawHeight(ground_pos) + 2 // add player height
        player.target_position.y = Math.floor(raw_height)
        player.move(player.target_position)
        player.target_position = null
        return
      }

      // we don't want to go futher if no chunks are loaded
      // this check must be after the target_position check
      if (!chunks_loaded) return

      // Avoid falling to hell
      // TODO: tp to nether if falling to hell
      if (origin.y <= 10) {
        velocity.setScalar(0)
        player.move(new Vector3(origin.x, 125, origin.z))
        return
      }

      const movement = new Vector3()

      if (inputs.forward || (inputs.mouse_left && inputs.mouse_right))
        movement.add(camera_forward)
      if (inputs.backward) movement.sub(camera_forward)
      if (inputs.right) movement.add(camera_right)
      if (inputs.left) movement.sub(camera_right)

      const speed = inputs.walk ? WALK_SPEED : SPEED

      // normalize sideways movement
      if (movement.length()) movement.normalize().multiplyScalar(speed * delta)

      // Apply jump force
      if (on_ground) {
        if (jump_cooldown > 0) jump_cooldown -= delta
        if (inputs.jump && jump_cooldown <= 0) {
          velocity.y = JUMP_FORCE

          const forward_impulse = movement
            .clone()
            .normalize()
            .multiplyScalar(JUMP_FORWARD_IMPULSE)

          velocity.x += forward_impulse.x
          velocity.z += forward_impulse.z

          jump_state = jump_states.ASCENT
          jump_cooldown = JUMP_COOLDWON
          on_ground = false

          context.send_packet('packet/characterAction', {
            id: player.id,
            action: 'JUMP',
          })
          is_walking = false
        } else {
          jump_state = jump_states.NONE

          // reset jump impulse
          velocity.x = 0
          velocity.z = 0
          velocity.y = 0
        }
      }

      switch (jump_state) {
        case jump_states.ASCENT:
          // if started jumping, apply normal gravity
          velocity.y -= GRAVITY * ASCENT_GRAVITY_FACTOR * delta
          // prepare apex phase
          if (velocity.y <= 0.2) jump_state = jump_states.APEX
          break
        case jump_states.APEX:
          // if apex phase, apply reduced gravity
          velocity.y -= GRAVITY * APEX_GRAVITY_FACTOR * delta
          // prepare descent phase
          if (velocity.y <= 0) jump_state = jump_states.DESCENT
          break
        case jump_states.DESCENT:
          // if descent phase, apply increased gravity
          velocity.y -= GRAVITY * DESCENT_GRAVITY_FACTOR * delta
          // and also cancel forward impulse
          velocity.x = lerp(velocity.x, 0, 0.1)
          velocity.z = lerp(velocity.z, 0, 0.1)
          break
        case jump_states.NONE:
        default:
          // if not jumping, apply normal gravity as long as chunks are there
          if (on_ground) velocity.y = -GRAVITY * delta
          else velocity.y -= GRAVITY * DESCENT_GRAVITY_FACTOR * delta
      }

      movement.addScaledVector(velocity, delta)
      dummy.position.copy(origin.clone().add(movement))

      const { x, z } = dummy.position
      const ground_pos = new Vector2(Math.floor(x), Math.floor(z)) // .subScalar(0.5)
      const raw_height = WorldGenerator.instance.getRawHeight(ground_pos)
      const ground_height = Math.floor(raw_height)

      if (!ground_height) return

      const target_y = ground_height + player.height + 0.2
      const dummy_bottom_y = dummy.position.y - player.height - 0.2
      const ground_height_distance = ground_height - dummy_bottom_y

      if (dummy_bottom_y <= ground_height) {
        dummy.position.y = lerp(dummy.position.y, target_y, 0.2)
        velocity.y = 0
        on_ground = true
      } else {
        on_ground = false
      }

      if (ground_height_distance > 2) dummy.position.copy(origin)

      if (player.position.distanceTo(dummy.position) > 0.01) {
        player.move(dummy.position)
      }

      const is_moving_horizontally = movement.x !== 0 || movement.z !== 0

      if (inputs.dance && !is_dancing && Date.now() - last_dance > 1000) {
        is_dancing = true
        last_dance = Date.now()
        context.send_packet('packet/characterAction', {
          id: player.id,
          action: 'DANCE',
        })
      }

      if (is_moving_horizontally) {
        is_dancing = false
        player.rotate(movement)

        if (on_ground) {
          if (inputs.walk && !is_walking) {
            is_walking = true
            context.send_packet('packet/characterAction', {
              id: player.id,
              action: 'WALK',
            })
          }

          if (!inputs.walk && is_walking) {
            is_walking = false
            context.send_packet('packet/characterAction', {
              id: player.id,
              action: 'RUN',
            })
          }
        }

        if (on_ground) play_step_sound()
      }

      const animation_name = compute_animation_state({
        is_on_ground: dummy_bottom_y - 4 < ground_height,
        // is_on_ground: ground_distance < 5,
        is_moving_horizontally,
        action:
          jump_state === jump_states.ASCENT
            ? 'JUMP'
            : inputs.walk && is_moving_horizontally
              ? 'WALK'
              : inputs.dance
                ? 'DANCE'
                : null,
      })

      if (is_moving_horizontally || !on_ground) player.animate(animation_name)
      else player.animate(inputs.dance ? 'DANCE' : 'IDLE')

      // const last_chunk = to_chunk_position(origin)
      // const current_chunk = to_chunk_position(dummy.position)

      // compute_sensors({
      //   player,
      //   character: {
      //     capsule_radius: player.radius,
      //     capsule_segment: player.segment,
      //   },
      //   sensors: shared.get_sensors(current_chunk),
      // })
    },
    reduce(state, { type, payload }) {
      // if the character is mine
      if (
        type === 'packet/characterPosition' &&
        payload.id === state.selected_character_id
      ) {
        const target_character = state.characters.find(
          character => character.id === payload.id,
        )
        // and if it's the current controlled character
        if (target_character)
          target_character.target_position = payload.position
      }
      return state
    },
    observe({ events, signal, dispatch, send_packet }) {
      aiter(abortable(setInterval(50, null, { signal }))).reduce(
        last_position => {
          const player = current_character()

          if (!player.position) return last_position

          /** @type {Vector3} */
          // @ts-ignore
          const { position } = player

          // round position with 2 decimals
          const x = Math.round(position.x * 100) / 100
          const y = Math.round(position.y * 100) / 100
          const z = Math.round(position.z * 100) / 100

          if (
            last_position.x !== x ||
            last_position.y !== y ||
            last_position.z !== z
          ) {
            send_packet('packet/characterPosition', {
              id: player.id,
              position: { x, y, z },
            })
          }

          return { x, y, z }
        },
        { x: 0, y: 0, z: 0 },
      )

      events.once('CHUNKS_LOADED', () => {
        chunks_loaded = true
      })

      // @ts-ignore
      dispatch('') // dispatch meaningless action to trigger the first state change and allow player_spawn.js to register the player
    },
  }
}
