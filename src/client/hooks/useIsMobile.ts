import { useEffect, useState } from 'react'

// 手机断点，和 Tailwind 的 md（768px）对齐
const QUERY = '(max-width: 767px)'

export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return mobile
}
