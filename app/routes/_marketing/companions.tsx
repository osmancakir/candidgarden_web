import { redirect } from 'react-router'

export function loader() {
	return redirect('https://magpiejar.com/projects/all-the-beauty-in-the-world', {
		status: 301,
	})
}
